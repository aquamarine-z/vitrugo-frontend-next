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

interface ModelInfo {
    name: string;
    model: string;
}

interface ModelState {
    model: Live2DModel;
    name: string;
    x: number;
    y: number;
    dragging: boolean;
    offsetX: number;
    offsetY: number;
    motionSync?: MotionSync;
}

export function Live2dViewer({api, ...props}: Live2dViewerProps) {
    const audioContextRef = useRef<AudioContext | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const [audioQueue, setAudioQueue] = useState<ArrayBuffer[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [models, setModels] = useState<ModelState[]>([]);
    const [modelInfos, setModelInfos] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canvasReady, setCanvasReady] = useState(false);

    // 读取模型配置
    useEffect(() => {
        fetch("/live2d-models.json")
            .then(res => res.json())
            .then((data: ModelInfo[]) => {
                setModelInfos(data);
            })
            .catch(e => setError("无法加载模型配置: " + e))
            .finally(() => setLoading(false));
    }, []);

    // canvas 挂载检测
    useEffect(() => {
        if (canvasRef.current && canvasRef.current.offsetParent !== null) {
            setCanvasReady(true);
        }
    }, [canvasRef.current]);

    // 初始化 PIXI 应用和加载所有模型
    useEffect(() => {
        if (!canvasReady || !canvasRef.current || !modelInfos.length) return;
        if (appRef.current) return; // 防止重复初始化
        // @ts-expect-error
        if (!window.PIXI) window.PIXI = PIXI;
        // @ts-expect-error
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const app = new PIXI.Application({
            view: canvasRef.current,
            width: 900,
            height: 700,
            backgroundAlpha: 0,
            antialias: true,
            autoStart: true,
            preserveDrawingBuffer: true,
        });
        appRef.current = app;
        // 加载所有模型
        Promise.all(modelInfos.map((info, idx) =>
            Live2DModel.from(info.model).then(model => {
                // 初始坐标分散
                const x = 200 + idx * 250;
                const y = 350;
                model.x = x;
                model.y = y;
                model.scale.set(0.09);
                model.anchor.set(0.5, 0.5);
                // 拖拽事件
                model.interactive = true;
                model.buttonMode = true;
                // 拖拽状态
                let dragging = false;
                let offsetX = 0;
                let offsetY = 0;
                model.on('pointerdown', (event: any) => {
                    dragging = true;
                    offsetX = event.data.global.x - model.x;
                    offsetY = event.data.global.y - model.y;
                });
                model.on('pointerup', () => { dragging = false; });
                model.on('pointerupoutside', () => { dragging = false; });
                model.on('pointermove', (event: any) => {
                    if (dragging) {
                        model.x = event.data.global.x - offsetX;
                        model.y = event.data.global.y - offsetY;
                    }
                });
                // MotionSync
                let motionSync: MotionSync | undefined = undefined;
                try {
                    motionSync = new MotionSync(model.internalModel);
                    motionSync.loadDefaultMotionSync();
                } catch {}
                app.stage.addChild(model);
                return {model, name: info.name, x, y, dragging: false, offsetX: 0, offsetY: 0, motionSync};
            })
        )).then(loadedModels => {
            setModels(loadedModels);
        }).catch(e => setError("模型加载失败: " + e));
        return () => {
            app.destroy(true, {children: true, texture: true, baseTexture: true});
            appRef.current = null;
        };
    }, [canvasReady, modelInfos]);

    // 音频播放逻辑（只对第一个模型做同步）
    useEffect(() => {
        api.setApi?.(prev => ({...prev, playAudio: playAudioWithSync}));
    }, [models]);

    const playAudioWithSync = async (arrayBuffer: ArrayBuffer) => {
        setAudioQueue(prevQueue => [...prevQueue, arrayBuffer]);
    };

    useEffect(() => {
        const playNextAudio = async () => {
            if (isPlaying || audioQueue.length === 0 || !models.length) return;
            setIsPlaying(true);
            const arrayBuffer = audioQueue[0];
            setAudioQueue(prevQueue => prevQueue.slice(1));
            try {
                const audioContext = audioContextRef.current!;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                const destination = audioContext.createMediaStreamDestination();
                source.connect(destination);
                source.connect(audioContext.destination);
                // 只同步第一个模型
                const firstMotionSync = models[0]?.motionSync;
                if (firstMotionSync) {
                    firstMotionSync.play(destination.stream);
                }
                source.start(audioContext.currentTime);
                await new Promise<void>((resolve) => {
                    source.onended = () => {
                        firstMotionSync?.reset();
                        resolve();
                    };
                });
            } catch (error) {
                console.error('Audio processing failed:', error);
            } finally {
                setIsPlaying(false);
            }
        };
        playNextAudio();
    }, [audioQueue, isPlaying, models]);

    // 处理中断
    useEffect(() => {
        if (api.interrupted && models.length) {
            models.forEach(m => m.motionSync?.reset());
        }
    }, [api.interrupted, models]);

    return (
        <div style={{width: 900, height: 700, position: 'relative'}}>
            {error && <div style={{color: 'red', position: 'absolute', zIndex: 10}}>{error}</div>}
            <canvas
                ref={canvasRef}
                width={900}
                height={700}
                className="block w-full h-full"
                style={{background: 'transparent'}}
            />
            {/* 可选：模型名标签 */}
            {models.map((m, idx) => (
                <div key={idx} style={{
                    position: 'absolute',
                    left: m.model.x - 50,
                    top: m.model.y + 180,
                    width: 100,
                    textAlign: 'center',
                    color: '#fff',
                    textShadow: '0 0 4px #000',
                    pointerEvents: 'none',
                    fontWeight: 'bold',
                }}>{m.name}</div>
            ))}
        </div>
    );
}