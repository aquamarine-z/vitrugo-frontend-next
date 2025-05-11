import {Live2dViewerApi} from "@/components/live2d-viewer/live2d-viewer";
import {useEffect, useRef} from "react";
import {useAtom} from "jotai";
import {RoomStateStore} from "@/store/room-state-store";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";
import { Button } from "@/components/ui/button";

interface RoomWebsocketConnectorProps {
    live2dApi?: Live2dViewerApi;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
}

export function RoomWebsocketConnector(props: RoomWebsocketConnectorProps) {
    const [roomState, setRoomState] = useAtom(RoomStateStore)
    const subtitleTimeoutRef = useRef(null)
    const currentSubtitleRef = useRef("")
    const reconnectTimeoutRef = useRef<number>(null)
    const [, setChatStore] = useAtom(ChatStore)

    // 连接/断开逻辑
    const handleConnect = () => {
        connectWebSocket();
    };
    const handleDisconnect = () => {
        if (roomState.websocket) {
            roomState.websocket.close();
            setRoomState(prev => ({ ...prev, websocket: undefined, isConnected: false }));
        }
    };

    // 连接 WebSocket
    const connectWebSocket = () => {
        try {
            if (roomState.websocket?.readyState === WebSocket.OPEN) {
                return;
            }
            // 直接使用 ws 地址，不拼接 token
            const wsUrl = `ws://127.0.0.1:8081/ws`;
            const websocket = new WebSocket(wsUrl);
            websocket.onopen = () => {
                console.log('WebSocket 连接已建立');
                setRoomState(prev => ({ ...prev, isConnected: true }));
                reconnectAttempts = 0;
            };
            websocket.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.audio) {
                            // TTSMessage: 解码并入队
                            enqueueAudio(msg.audio as string);
                            return;
                        }
                        // ...existing non-audio 消息处理...
                    } catch (e) {
                        console.error('解析消息失败:', e);
                    }
                }
            };
            websocket.onerror = (error) => {
                console.error('WebSocket 错误:', error);
                setRoomState(prev => {
                    return {
                        ...prev,
                        isConnected: false,
                    }
                })
            };
            websocket.onclose = (event) => {
                console.log('WebSocket 连接已关闭, 代码:', event.code, '原因:', event.reason);
                setRoomState(prev => {
                    return {
                        ...prev,
                        isConnected: false,
                    }
                })
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    console.log(`尝试第 ${reconnectAttempts} 次重连...`);
                    reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000) as unknown as number;
                } else {
                }
            };
            setRoomState(prev => ({ ...prev, websocket: websocket }));
        } catch (error) {
            console.error('创建 WebSocket 连接失败:', error);
        }
    };

    // 组件级变量
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    // 简易音频队列及播放指针
    const audioQueueRef = useRef<ArrayBuffer[]>([]);
    const isPlayingRef = useRef(false);

    // 顺序播放队列中的音频
    const processQueue = async () => {
        if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
        isPlayingRef.current = true;
        const buffer = audioQueueRef.current.shift()!;
        try {
            await props.live2dApi?.playAudio?.(buffer);
        } catch (e) {
            console.error('Audio play failed', e);
        }
        isPlayingRef.current = false;
        processQueue();
    };

    // 从后端 JSON 消息中解码音频并入队
    const enqueueAudio = (base64: string) => {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        audioQueueRef.current.push(bytes.buffer);
        processQueue();
    };

    useEffect(() => {
        return () => {
            if (roomState.websocket) {
                roomState.websocket.close();
                setRoomState(prev => ({ ...prev, websocket: undefined, isConnected: false }));
            }
            if (subtitleTimeoutRef.current) {
                clearTimeout(subtitleTimeoutRef.current);
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, []);

    // 侧边栏宽度
    const SIDEBAR_WIDTH = 320;
    const buttonTransform = props.sidebarOpen ? `translateX(${SIDEBAR_WIDTH}px)` : 'none';
    const buttonTransition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';

    return <>
        {/* 齿轮按钮 */}
        <Button variant="ghost" size="icon" style={{ position: 'fixed', top: 16, left: 16, zIndex: 1000, transform: buttonTransform, transition: buttonTransition }} onClick={() => props.setSettingsOpen(true)}>
            <svg width="24" height="24" fill="none" stroke="#fff" style={{color: '#fff'}} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .66.38 1.26 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.66 0 1.26.38 1.51 1H21a2 2 0 1 1 0 4h-.09c-.25 0-.48.09-.68.26z"/></svg>
        </Button>
        {/* 设置弹窗（居中圆角弹窗） */}
        {props.settingsOpen && (
            <>
                {/* 遮罩层 */}
                <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.25)', zIndex: 2000 }} onClick={() => props.setSettingsOpen(false)} />
                {/* 居中弹窗 */}
                <div style={{
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    minWidth: 480,
                    maxWidth: '95vw',
                    minHeight: 320,
                    background: 'var(--sidebar, #fff)',
                    color: 'var(--sidebar-foreground, #222)',
                    zIndex: 2100,
                    borderRadius: 18,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    padding: 40,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                }} onClick={e => e.stopPropagation()}>
                    {/* 右上角关闭按钮 */}
                    <Button variant="ghost" size="icon" style={{ position: 'absolute', top: 12, right: 12 }} onClick={() => props.setSettingsOpen(false)} aria-label="关闭设置">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
                    </Button>
                    <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>设置</div>
                    {/* 此处可添加其它设置项 */}
                    <div style={{ flex: 1 }} />
                </div>
            </>
        )}
        {/* 连接/断开按钮 */}
        <div style={{ position: 'fixed', top: 16, left: 72, zIndex: 1000, transform: buttonTransform, transition: buttonTransition }}>
            {roomState.isConnected ? (
                <Button variant="destructive" onClick={handleDisconnect}>断开连接</Button>
            ) : (
                <Button onClick={handleConnect}>连接</Button>
            )}
        </div>
    </>
}