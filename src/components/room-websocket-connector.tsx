import {Live2dViewerApi} from "@/components/live2d-viewer/live2d-viewer";
import {useEffect, useRef} from "react";
import {useAtom} from "jotai";
import {RoomStateStore} from "@/store/room-state-store";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";

interface RoomWebsocketConnectorProps {
    live2dApi?: Live2dViewerApi
}

export function RoomWebsocketConnector(props: RoomWebsocketConnectorProps) {
    const [roomState, setRoomState] = useAtom(RoomStateStore)
    const subtitleTimeoutRef = useRef(null)
    const currentSubtitleRef = useRef("")
    const reconnectTimeoutRef = useRef<number>(null)
    const [, setChatStore] = useAtom(ChatStore)


    useEffect(() => {
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;

        if (!props?.live2dApi?.playAudio) return
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const playAudio = async (arrayBuffer) => {
            try {
                console.log('收到音频数据，大小:', arrayBuffer.byteLength);

                // 先尝试直接播放音频确认数据是否正确
                const blob = new Blob([arrayBuffer], {type: 'audio/mp3'});
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);

                // 监听音频加载完成事件
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

                // 如果音频数据正确，则进行 Live2D 同步播放
                await props.live2dApi?.playAudio?.(arrayBuffer)

                // 清理资源
                URL.revokeObjectURL(audioUrl);
            } catch (error) {
                console.error('音频播放失败:', error);

            }
        };
        const connectWebSocket = () => {
            try {
                if (roomState.websocket?.readyState === WebSocket.OPEN) {
                    return;
                }
                const websocket = new WebSocket('ws://127.0.0.1:8080/ws');
                websocket.binaryType = 'arraybuffer'; // 设置二进制数据类型
                websocket.onopen = () => {
                    console.log('WebSocket 连接已建立');
                    setRoomState(prev => {
                        return {
                            ...prev,
                            isConnected: true
                        }
                    })
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
                setRoomState(prev => {
                    return {
                        ...prev,
                        websocket: websocket
                    }
                })
            } catch (error) {
                console.error('创建 WebSocket 连接失败:', error);
                //antdMessage.error('创建连接失败');
            }

        };

        connectWebSocket();

        return () => {
            if (!props.live2dApi?.playAudio) return
            if (roomState.websocket) {
                roomState.websocket.close();
                setRoomState(prev => {
                    return {
                        ...prev,
                        websocket: undefined,
                    }
                })
            }
            if (subtitleTimeoutRef.current) {
                clearTimeout(subtitleTimeoutRef.current);
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [props.live2dApi?.playAudio]);
    useEffect(() => {

    }, [props.live2dApi])
    return <>
    </>
}