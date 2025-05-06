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
            websocket.binaryType = 'arraybuffer';
            websocket.onopen = () => {
                console.log('WebSocket 连接已建立');
                setRoomState(prev => ({ ...prev, isConnected: true }));
                reconnectAttempts = 0;
            };
            websocket.onmessage = (event) => {
                // 处理二进制数据（MP3）
                if (event.data instanceof ArrayBuffer) {
                    console.log('收到音频数据');
                    playAudio(event.data);
                    return;
                }
                console.log('收到消息:', event.data);
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'interrupt' || data.content === 'interrupt') {
                        console.log('将interrupt改为true');
                        //setInterrupted(true);
                        props.live2dApi?.setApi?.(prev => {
                            return {...prev, interrupted: true}
                        })
                        return;
                    }
                    // 如果是结束消息（空content和包含finish_reason），则不处理
                    if (data.content === '' && data.response_meta?.finish_reason) {
                        // 当收到结束消息时，启动8秒计时器
                        if (data.response_meta?.finish_reason === 'stop') {
                            //const currentSubtitle = subtitle; // 保存当前的完整回复
                            const currentSubtitle = currentSubtitleRef.current;

                            console.log('完整的回复是', currentSubtitle);
                            const newMessage = {
                                content: currentSubtitle,
                                type: "assistant",
                                name: "AI"
                            } as ChatMessage
                            setChatStore(prev => {
                                return {
                                    ...prev,
                                    messages: [...prev.messages, newMessage]
                                }
                            })
                            currentSubtitleRef.current = ""
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-expect-error
                            subtitleTimeoutRef.current = setTimeout(() => {

                                // 将完整回复添加到聊天历史
                                setRoomState(prev => {
                                    return {
                                        ...prev,
                                        subtitle: "",
                                        subtitleVisible: false
                                    }
                                })
                            }, 8000); // 改为8秒
                        }
                        return;
                    }

                    // 只提取content内容
                    const response = data.content || '';

                    // 更新字幕，但不重置之前的内容
                    setRoomState(prev => {
                        return {
                            ...prev,
                            subtitle: prev.subtitle + response,
                            subtitleVisible: true
                        }
                    });
                    currentSubtitleRef.current += response
                    // 清除之前的定时器（如果存在）
                    if (subtitleTimeoutRef.current) {
                        clearTimeout(subtitleTimeoutRef.current);
                    }
                } catch (error) {
                    console.error('解析消息失败:', error);
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

    // playAudio 函数提升到组件作用域
    const playAudio = async (arrayBuffer: ArrayBuffer) => {
        try {
            console.log('收到音频数据，大小:', arrayBuffer.byteLength);
            const blob = new Blob([arrayBuffer], {type: 'audio/mp3'});
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            await new Promise((resolve, reject) => {
                audio.oncanplaythrough = resolve;
                audio.onerror = reject;
                audio.load();
            });
            console.log('音频数据加载成功，开始播放');
            if (!props.live2dApi?.playAudio) {
                console.error('Live2D ref 未初始化');
                return;
            }
            await props.live2dApi?.playAudio?.(arrayBuffer)
            URL.revokeObjectURL(audioUrl);
        } catch (error) {
            console.error('音频播放失败:', error);
        }
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