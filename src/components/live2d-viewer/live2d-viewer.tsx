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
    // 全局 AudioContext 引用
    const audioContextRef = useRef<AudioContext | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
        if (!window.PIXI) window.PIXI = PIXI;
        // 初始化全局 AudioContext
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-expect-error
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
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
                // 解码并创建播放源
                const audioContext = audioContextRef.current!;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
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
                // 在统一 AudioContext 的 currentTime 上开始
                motionSyncRef.current.play(destination.stream);
                source.start(audioContext.currentTime);

                await new Promise<void>((resolve) => {
                    source.onended = () => {
                        motionSyncRef.current?.reset();
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
        //mao_pro_zh/runtime/mao_pro.model3.json
        //hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json
        //ariu/ariu.model3.json
        Live2DModel.from("mao_pro_zh/runtime/mao_pro.model3.json").then((model) => {
        
            const motionSync = new MotionSync(model.internalModel);
            motionSyncRef.current = motionSync;
            motionSync.loadDefaultMotionSync();

            app.stage.addChild(model);
            model.x = app.screen.width / 2;
            model.y = app.screen.height / 2;
            model.scale.set(0.09);
            model.anchor.set(0.5, 0.5);
            

            // // === 钟摆式随机目标角度摇摆 ===
            // let currentAngle = 0;
            // let startAngle = 0;
            // let targetAngle = 0;
            // let animStartTime = 0;
            // let animDuration = 1000; // ms
            // let stayDuration = 1000; // ms
            // let isStaying = false;
            // const minAngle = -70;
            // const maxAngle = 70;
            // const minStay = 3000; // ms
            // const maxStay = 5000; // ms
            // const minAnim = 100; // ms
            // const maxAnim = 120; // ms
            // function randomTarget() {
            //     return minAngle + Math.random() * (maxAngle - minAngle);
            // }
            // function randomStay() {
            //     return minStay + Math.random() * (maxStay - minStay);
            // }
            // function randomAnim() {
            //     return minAnim + Math.random() * (maxAnim - minAnim);
            // }
            // function easeInOut(t: number) {
            //     return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            // }
            // function setNextTarget() {
            //     startAngle = currentAngle;
            //     const minDelta = 35; // 最小角度差，单位：度
            //     let next;
            //     let tryCount = 0;
            //     do {
            //         next = randomTarget();
            //         tryCount++;
            //     } while (Math.abs(next - currentAngle) < minDelta && tryCount < 10);
            //     targetAngle = next;
            //     animDuration = randomAnim();
            //     animStartTime = Date.now();
            //     isStaying = false;
            //     console.log('新目标角度:', targetAngle); // 输出每次设定的角度
            // }
            // setNextTarget();
            // let animationFrameId: number;
            // const animate = () => {
            //     const now = Date.now();
            //     if (!isStaying) {
            //         const t = Math.min((now - animStartTime) / animDuration, 1);
            //         const progress = easeInOut(t);
            //         currentAngle = startAngle + (targetAngle - startAngle) * progress;
            //         if (t >= 1) {
            //             isStaying = true;
            //             animStartTime = now;
            //             stayDuration = randomStay();
            //         }
            //     } else {
            //         // 停留阶段
            //         if (now - animStartTime > stayDuration) {
            //             setNextTarget();
            //         }
            //     }
            //     // 设置头部和身体参数
            //     (model.internalModel.coreModel as any).setParameterValueById('ParamAngleX', 0);
            //     (model.internalModel.coreModel as any).setParameterValueById('ParamAngleY', 0);
            //     (model.internalModel.coreModel as any).setParameterValueById('ParamAngleZ', currentAngle);
            //     (model.internalModel.coreModel as any).setParameterValueById('ParamBodyAngleX', currentAngle * 0.3);
            //     (model.internalModel.coreModel as any).setParameterValueById('ParamBodyAngleZ', currentAngle);
            //     animationFrameId = requestAnimationFrame(animate);
            // };
            // animate();
            // // 清理事件
            // const cleanup = () => {
            //     cancelAnimationFrame(animationFrameId);
            //     app.destroy(true, {children: true, texture: true, baseTexture: true});
            // };
            // props.onLoad?.()
            // return cleanup;
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        }).catch((error: any) => {
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