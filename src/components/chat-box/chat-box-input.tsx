import {Button} from "@/components/ui/button";
import {PhoneIcon, SendHorizonalIcon} from "lucide-react";
import {Textarea} from "@/components/ui/textarea";
import {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {ChatMessage, ChatStore} from "@/store/chat-store";
import {LiveStore} from "@/store/live-store";
import {toast} from "sonner";
import {LanguageStore} from "@/store/language-store";

export function ChatBoxInput() {
    const [inputMessage, setInputMessage] = useState("")
    const [chatStore, setChatStore] = useAtom(ChatStore)
    const audioContextRef = useRef(null);
    const [liveStore, setLiveStore] = useAtom(LiveStore)
    const wsRef = useRef<WebSocket>(null);
    const [isConnected, setIsConnected] = useState(false);
    const subtitleTimeoutRef = useRef(null)
    const currentSubtitleRef = useRef("")
    const reconnectTimeoutRef = useRef<number>(null)
    const mediaRecorderRef = useRef(null)
    const [isRecording, setIsRecording] = useState(false)
    const language = useAtom(LanguageStore)[0].languagePack
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-expect-error
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        return () => {
            if (audioContextRef.current) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                //@ts-expect-error
                audioContextRef.current.close();
            }
        };
    }, []);
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

            if (!liveStore.audioPlayer) {
                console.error('Live2D ref 未初始化');
                return;
            }

            // 如果音频数据正确，则进行 Live2D 同步播放
            await liveStore.audioPlayer(arrayBuffer);

            // 清理资源
            URL.revokeObjectURL(audioUrl);
        } catch (error) {
            console.error('音频播放失败:', error);

        }
    };
    useEffect(() => {
        //if(!liveStore.audioPlayer) return 
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;

        const connectWebSocket = () => {
            try {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    return;
                }

                wsRef.current = new WebSocket('ws://127.0.0.1:8080/ws');
                wsRef.current.binaryType = 'arraybuffer'; // 设置二进制数据类型

                wsRef.current.onopen = () => {
                    console.log('WebSocket 连接已建立');
                    setIsConnected(true);
                    reconnectAttempts = 0;
                };

                wsRef.current.onmessage = (event) => {
                    // 处理二进制数据（MP3）
                    if (event.data instanceof ArrayBuffer) {
                        console.log('收到音频数据');
                        playAudio(event.data);
                        return;
                    }


                    // 处理文本消息
                    console.log('收到消息:', event.data);

                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'interrupt' || data.content === 'interrupt') {
                            console.log('将interrupt改为true');
                            //setInterrupted(true);
                            setLiveStore({...liveStore, interrupted: true})
                            return;
                        }
                        // 如果是结束消息（空content和包含finish_reason），则不处理
                        if (data.content === '' && data.response_meta?.finish_reason) {
                            // 当收到结束消息时，启动8秒计时器
                            if (data.response_meta?.finish_reason === 'stop') {
                                //const currentSubtitle = subtitle; // 保存当前的完整回复
                                const currentSubtitle = currentSubtitleRef.current;
                                console.log('完整的回复是', currentSubtitle);

                                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                // @ts-expect-error
                                subtitleTimeoutRef.current = setTimeout(() => {
                                    // 将完整回复添加到聊天历史
                                    setChatStore({
                                        ...chatStore,
                                        subtitle: currentSubtitle,
                                    })
                                }, 8000); // 改为8秒
                            }
                            return;
                        }

                        // 只提取content内容
                        const response = data.content || '';

                        // 更新字幕，但不重置之前的内容
                        setChatStore(prev => {
                            return {
                                ...prev,
                                subtitle: prev.subtitle + response,
                                subtitleVisible: true
                            }
                        });


                        // 清除之前的定时器（如果存在）
                        if (subtitleTimeoutRef.current) {
                            clearTimeout(subtitleTimeoutRef.current);
                        }
                    } catch (error) {
                        console.error('解析消息失败:', error);
                    }
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket 错误:', error);
                    setIsConnected(false);
                };

                wsRef.current.onclose = (event) => {
                    console.log('WebSocket 连接已关闭, 代码:', event.code, '原因:', event.reason);
                    setIsConnected(false);

                    // 如果没有超过最大重连次数，则尝试重连
                    if (reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        console.log(`尝试第 ${reconnectAttempts} 次重连...`);
                        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000) as unknown as number;
                        //antdMessage.warning(`连接断开，${3}秒后尝试重连...`);
                    } else {
                        //antdMessage.error('连接失败，请检查服务器是否正常运行');
                    }
                };
            } catch (error) {
                console.error('创建 WebSocket 连接失败:', error);
                //antdMessage.error('创建连接失败');
            }
        };

        connectWebSocket();

        return () => {
            if(!liveStore.audioPlayer)return
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (subtitleTimeoutRef.current) {
                clearTimeout(subtitleTimeoutRef.current);
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [liveStore.audioPlayer]);
    const handleSend = () => {
        if (!inputMessage.trim()) return;

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            //error('未连接到服务器，请等待重连...');
            return;
        }

        try {
            const wsMessage = {
                type: 'text',
                content: inputMessage
            };
            setChatStore(prev => {
                return {
                    ...prev,
                    messages: [...prev.messages, {content: inputMessage, type: "user"} as ChatMessage]
                }
            })

            console.log('发送消息:', wsMessage);
            wsRef.current.send(JSON.stringify(wsMessage));
            setInputMessage('');
        } catch (error) {
            console.error('发送消息失败:', error);
        }
    };

    function convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
        let len = buffer.length;
        if (len % 2 !== 0) len++; // 确保长度是偶数

        const int16Array = new Int16Array(len);
        for (let i = 0; i < buffer.length; i++) {
            const s = Math.max(-1, Math.min(1, buffer[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        return int16Array.buffer;
    }

    const handleToggleRecording = async () => {
        if (isRecording) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({audio: true});
                const audioContext = new AudioContext({sampleRate: 16000});
                const mediaStreamSource = audioContext.createMediaStreamSource(stream);
                const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

                scriptProcessor.onaudioprocess = (event) => {
                    const inputData = event.inputBuffer.getChannelData(0);
                    const int16Data = convertFloat32ToInt16(inputData);

                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(int16Data);
                    } else {
                        // 处理WebSocket断开的情况
                        console.error('WebSocket未连接');
                    }
                };

                mediaStreamSource.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                mediaRecorderRef.current = {
                    stop: () => {
                        scriptProcessor.disconnect();
                        mediaStreamSource.disconnect();
                        stream.getTracks().forEach(track => track.stop());
                        audioContext.close();
                    }
                };

                setIsRecording(true);
            } catch (error) {
                console.error('麦克风访问失败:', error);
                toast('无法访问麦克风，请检查权限')
            }
        }
    };
    return <div className={"w-full h-full flex flex-col gap-2"}>
        <div className={"w-full flex flex-row px-2 items-center justify-end gap-2"}>
            <Button onClick={handleToggleRecording}
                    className={isRecording ? "bg-red-300 hover:bg-red-200" : "bg-green-300 hover:bg-green-200" + " transition"}
                    disabled={!isConnected}><PhoneIcon/></Button>
            <div className={"grow"}/>
            <Button disabled={!isConnected} onClick={() => {
                handleSend()
            }}><SendHorizonalIcon/>{language['chat-input.message-send-button.title']}</Button>
        </div>
        <Textarea value={inputMessage} onChange={e => {
            setInputMessage(e.target.value)
        }} className={"w-full h-full resize-none"} placeholder={"Input your message here"}></Textarea>
    </div>
}