'use client'
import {SetStateAction, useEffect, useRef, useState} from "react";
import * as PIXI from "pixi.js";
import {Live2DModel} from "pixi-live2d-display/cubism4";
import {MotionSync} from "live2d-motionsync/stream";

interface Live2dViewerProps {
    onLoad?: () => void
    api: Live2dViewerApi,
}
type AudioPlayerCallback = (buffer: ArrayBuffer) => Promise<void>;

export class Live2dViewerApi {
    playAudio?: AudioPlayerCallback;
    interrupted?: boolean;
    setApi?: (action:SetStateAction<Live2dViewerApi>)=>void
}

export function Live2dViewer({api,...props}: Live2dViewerProps) {
    const canvasRef = useRef(null);
    const appRef = useRef<PIXI.Application>(null); // 用于存储 PIXI 应用实例
    const motionSyncRef = useRef<MotionSync>(null);  // 添加 motionSync 的 ref
    const audioSourceRef = useRef<AudioBufferSourceNode>(null);
    const [audioQueue, setAudioQueue] = useState<ArrayBuffer[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        if (api.interrupted) {
            if (motionSyncRef.current) {
                motionSyncRef.current.reset();
            }
            if (audioSourceRef.current) {
                audioSourceRef.current?.stop();
                audioSourceRef.current = null; // 清空 source
            }
        }
    }, [api.interrupted]);

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-expect-error
        if (!window.PIXI) window.PIXI = PIXI; // 让 pixi-live2d-display 能自动更新 Live2D 模型
    }, []);

    const playAudioWithSync = async (arrayBuffer: ArrayBuffer) => {
        setAudioQueue(prevQueue => [...prevQueue, arrayBuffer]);
    };

    useEffect(() => {
        const playNextAudio = async () => {
            if (isPlaying || audioQueue.length === 0) return;

            setIsPlaying(true);
            const arrayBuffer = audioQueue[0];
            setAudioQueue(prevQueue => prevQueue.slice(1));

            try {
                if (!motionSyncRef.current) {
                    console.error('motionSync not initialized');
                    setIsPlaying(false);
                    return;
                }
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                //@ts-expect-error
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const audioData = arrayBuffer.slice(0);
                const audioBuffer = await audioContext.decodeAudioData(audioData);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                audioSourceRef.current = source;

                const destination = audioContext.createMediaStreamDestination();
                source.connect(destination);
                source.connect(audioContext.destination);
                api.setApi?.((prev) => {
                    return {
                        ...prev,
                        interrupted: false
                    }
                })
                motionSyncRef.current.play(destination.stream);
                source.start(0);

                await new Promise<void>((resolve) => {
                    source.onended = () => {
                        motionSyncRef.current?.reset();
                        audioContext.close();
                        resolve();
                    };
                });
            } catch (error) {
                console.error('Audio processing failed:', error);
                throw error;
            } finally {
                setIsPlaying(false);
            }
        };

        playNextAudio();
    }, [audioQueue, isPlaying]);

    useEffect(() => {
        api.setApi?.(prev => {
            return {
                ...prev,
                playAudio: playAudioWithSync
            }
        })
    }, []);

    useEffect(() => {
        if (!canvasRef.current) return;

        const app = new PIXI.Application({
            view: canvasRef.current,
            width: 500,
            height: 700,
            backgroundAlpha: 0,
        });
        appRef.current = app;
        Live2DModel.from("/ariu/ariu.model3.json").then((model) => {
            const motionSync = new MotionSync(model.internalModel);
            motionSyncRef.current = motionSync;
            motionSync.loadDefaultMotionSync();

            app.stage.addChild(model);
            model.x = app.screen.width / 2;
            model.y = app.screen.height / 2;
            model.scale.set(0.12);
            model.anchor.set(0.5, 0.5);

            model.expression("exp_02");
            model.on("hit", (hitAreas: string | string[]) => {
                console.log("hit", hitAreas);
                if (hitAreas.includes("Body")) {
                    model.motion("Tap");
                }
            });

            props.onLoad?.()

            return () => {
                app.destroy(true, {children: true, texture: true, baseTexture: true});
            };
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //@ts-expect-error
        }).catch((error: never) => {
            console.error("Failed to load Live2D model", error);
        });

        return () => {
            // Cleanup if necessary
        };
    }, [props.onLoad]);

    return <canvas
        ref={canvasRef}
        className="w-full h-full block"
    />
}