

'use client'
import {SetStateAction, useEffect, useRef, useState} from "react";
import * as PIXI from "pixi.js";
import {Live2DModel} from "pixi-live2d-display/cubism4";
import {MotionSync} from "live2d-motionsync/stream";

interface Live2dViewerProps {
    onLoad?: () => void
    api: Live2dViewerApi,
}
type AudioPlayerCallback = (buffer: ArrayBuffer, sender_name?: string) => Promise<void>;

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

// 定义音频队列项接口
interface AudioQueueItem {
    buffer: ArrayBuffer;
    sender_name: string;
    onComplete?: () => void;
}


export function Live2dViewer({api, }: Live2dViewerProps) {
    const audioContextRef = useRef<AudioContext | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    // 保存当前正在播放的音频源引用，方便中断时停止
    const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const currentAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const [audioQueue, setAudioQueue] = useState<AudioQueueItem[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [models, setModels] = useState<ModelState[]>([]);
    const [modelInfos, setModelInfos] = useState<ModelInfo[]>([]);
    const [, setLoading] = useState(true);
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

    // 以900x700为基准，动态计算缩放比例，canvas铺满屏幕
    const baseWidth = 900;
    const baseHeight = 700;
    const [viewerSize] = useState({ width: 1920, height: 900 });
    const viewerWidth = viewerSize.width;
    const viewerHeight = viewerSize.height;
    const scaleRatio = Math.min(viewerWidth / baseWidth, viewerHeight / baseHeight);

    // 读取本地模型缩放比例
    const getModelScale = (name: string) => {
        if (typeof window === 'undefined') return 1;
        try {
            const scaleMap = JSON.parse(localStorage.getItem('live2dScale') || '{}');
            return typeof scaleMap[name] === 'number' ? scaleMap[name] : 1;
        } catch { return 1; }
    };

    // 初始化 PIXI 应用和加载所有模型
    useEffect(() => {
        if (!canvasReady || !canvasRef.current || !modelInfos.length) return;
        if (appRef.current) return; // 防止重复初始化
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-expect-error
        if (!window.PIXI) window.PIXI = PIXI;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-expect-error
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const app = new PIXI.Application({
            view: canvasRef.current,
            width: viewerWidth,
            height: viewerHeight,
            backgroundAlpha: 0,
            antialias: true,
            autoStart: true,
            preserveDrawingBuffer: true,
        });
        appRef.current = app;
        // 加载所有模型
        Promise.all(modelInfos.map((info, idx) =>
            Live2DModel.from(info.model).then(model => {
                // 原始坐标和缩放，始终等比例居中
                const baseX = 200 + idx * 250;
                const baseY = 350;
                model.x = baseX * scaleRatio + (viewerWidth - baseWidth * scaleRatio) / 2;
                model.y = baseY * scaleRatio + (viewerHeight - baseHeight * scaleRatio) / 2;
                const userScale = getModelScale(info.name);
                model.scale.set(0.09 * scaleRatio * userScale);
                model.anchor.set(0.5, 0.5);
                // 拖拽事件
                model.interactive = true;
                model.buttonMode = true;
                // 拖拽状态
                let dragging = false;
                let offsetX = 0;
                let offsetY = 0;
                model.on('pointerdown', (event) => {
                    dragging = true;
                    offsetX = event.data.global.x - model.x;
                    offsetY = event.data.global.y - model.y;
                });
                model.on('pointerup', () => { dragging = false; });
                model.on('pointerupoutside', () => { dragging = false; });
                model.on('pointermove', (event) => {
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
                return {model, name: info.name, x: model.x, y: model.y, dragging: false, offsetX: 0, offsetY: 0, motionSync};
            })
        )).then(loadedModels => {
            setModels(loadedModels);
        }).catch(e => setError("模型加载失败: " + e));
        return () => {
            app.destroy(true, {children: true, texture: true, baseTexture: true});
            appRef.current = null;
        };
    }, [canvasReady, modelInfos, viewerWidth, viewerHeight]);

    // 音频播放逻辑（根据sender_name确定模型）
    useEffect(() => {
        api.setApi?.(prev => ({...prev, playAudio: playAudioWithSync}));
    }, [models]);

    const playAudioWithSync = async (arrayBuffer: ArrayBuffer, sender_name: string = 'default') => {
        return new Promise<void>((resolve) => {
            setAudioQueue(prevQueue => [...prevQueue, { 
                buffer: arrayBuffer, 
                sender_name,
                onComplete: resolve
            }]);
        });
    };

    useEffect(() => {
        const playNextAudio = async () => {
            // 检查是否正在播放、是否有队列项、是否有模型
            if (isPlaying || audioQueue.length === 0 || !models.length) return;
            
            // 检查是否处于中断状态
            if (api.interrupted) {
                console.log('播放器处于中断状态，忽略队列');
                setAudioQueue([]); // 中断状态下清空剩余队列
                return;
            }
            
            setIsPlaying(true);
            const queueItem = audioQueue[0];
            setAudioQueue(prevQueue => prevQueue.slice(1));
            try {
                // 再次检查是否被中断（双重保险）
                if (api.interrupted) {
                    console.log('检测到中断状态，跳过音频播放');
                    if (queueItem.onComplete) {
                        queueItem.onComplete();
                    }
                    setIsPlaying(false);
                    return;
                }
                
                const audioContext = audioContextRef.current!;
                const audioBuffer = await audioContext.decodeAudioData(queueItem.buffer.slice(0));
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                const destination = audioContext.createMediaStreamDestination();
                source.connect(destination);
                source.connect(audioContext.destination);
                
                // 保存当前音频源的引用
                currentAudioSourceRef.current = source;
                currentAudioDestinationRef.current = destination;
                
                // 根据sender_name查找对应的模型，如果找不到则使用第一个模型
                const targetModelIndex = models.findIndex(m => 
                    m.name.toLowerCase() === queueItem.sender_name.toLowerCase());
                const targetModel = targetModelIndex >= 0 ? models[targetModelIndex] : models[0];
                
                // 使用找到的模型的motionSync
                const targetMotionSync = targetModel?.motionSync;
                if (targetMotionSync) {
                    console.log(`使用模型 ${targetModel.name} 播放 ${queueItem.sender_name} 的语音`);
                    targetMotionSync.play(destination.stream);
                }
                
                source.start(audioContext.currentTime);
                
                // 创建一个可以被中断的播放Promise
                await new Promise<void>((resolve) => {
                    // 添加一个检查函数，在中断时也会触发完成
                    const checkInterrupt = () => {
                        if (api.interrupted || !currentAudioSourceRef.current) {
                            console.log('检测到中断或音频源已清除，提前结束播放');
                            if (targetMotionSync) targetMotionSync.reset();
                            resolve();
                            return true;
                        }
                        return false;
                    };
                    
                    // 设置周期性检查中断状态
                    const intervalId = setInterval(() => {
                        if (checkInterrupt()) {
                            clearInterval(intervalId);
                        }
                    }, 100);
                    
                    // 正常播放结束处理
                    source.onended = () => {
                        clearInterval(intervalId);
                        if (targetMotionSync) targetMotionSync.reset();
                        // 清除当前音频源引用
                        currentAudioSourceRef.current = null;
                        currentAudioDestinationRef.current = null;
                        resolve();
                    };
                });

                // 音频播放完成后调用回调
                if (queueItem.onComplete) {
                    queueItem.onComplete();
                }
            } catch (error) {
                console.error('Audio processing failed:', error);
            } finally {
                setIsPlaying(false);
            }
        };
        playNextAudio();
    }, [audioQueue, isPlaying, models, api.interrupted]);

    // 处理中断
    useEffect(() => {
        if (api.interrupted && models.length) {
            console.log('Live2D中断处理: 停止所有音频播放并重置模型');
            
            // 重置所有模型的动作同步
            models.forEach(m => m.motionSync?.reset());
            
            // 直接停止当前正在播放的音频源
            if (currentAudioSourceRef.current) {
                try {
                    currentAudioSourceRef.current.stop();
                    currentAudioSourceRef.current.disconnect();
                    currentAudioSourceRef.current = null;
                } catch (e) {
                    console.error('停止当前音频源失败:', e);
                }
            }
            
            // 断开当前的音频目标节点
            if (currentAudioDestinationRef.current) {
                try {
                    currentAudioDestinationRef.current.disconnect();
                    currentAudioDestinationRef.current = null;
                } catch (e) {
                    console.error('断开音频目标节点失败:', e);
                }
            }
            
            // 如果上述方法不起作用，则尝试通过重新创建AudioContext来强制停止所有音频
            if (audioContextRef.current) {
                try {
                    // 关闭当前的AudioContext
                    audioContextRef.current.close().catch(e => console.error('关闭AudioContext失败:', e));
                    
                    // 重新创建AudioContext
                    setTimeout(() => {
                        try {
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-expect-error
                            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                            console.log('已重新创建AudioContext');
                        } catch (e) {
                            console.error('重新创建AudioContext失败:', e);
                        }
                    }, 50);
                } catch (e) {
                    console.error('处理AudioContext失败:', e);
                }
            }
            
            // 重置播放状态和清空队列（双重保险）
            setAudioQueue([]);
            setIsPlaying(false);
        }
    }, [api.interrupted, models]);

    return (
        <div style={{width: '100vw', height: '100vh', position: 'relative', border: '2px solid #bbb', borderRadius: 16, background: '#222', boxSizing: 'border-box', overflow: 'hidden'}}>
            {error && <div style={{color: 'red', position: 'absolute', zIndex: 10}}>{error}</div>}
            <canvas
                ref={canvasRef}
                width={viewerWidth}
                height={viewerHeight}
                className="block w-full h-full"
                style={{background: 'transparent', borderRadius: 16, width: '100vw', height: '100vh', display: 'block', position: 'absolute', left: 0, top: 0}}
            />
            {/* 可选：模型名标签 */}
            {models.map((m, idx) => (
                <div key={idx} style={{
                    position: 'absolute',
                    left: m.model.x - 50 * scaleRatio,
                    top: m.model.y + 180 * scaleRatio,
                    width: 100 * scaleRatio,
                    textAlign: 'center',
                    color: '#fff',
                    textShadow: '0 0 4px #000',
                    pointerEvents: 'none',
                    fontWeight: 'bold',
                    fontSize: 18 * scaleRatio
                }}>{m.name}</div>
            ))}
        </div>
    );
}