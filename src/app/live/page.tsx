'use client'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from "@/components/ui/resizable";
import {ChatBox} from "@/components/chat-box/chat-box";
import {Toaster} from "@/components/ui/sonner";
import {Draggable} from "@/components/draggable";
import Script from "next/script";

import {useEffect, useState} from "react";
import dynamic from 'next/dynamic';
import {Subtitle} from "@/components/subtitle/subtitle";
import {Live2dViewerApi} from "@/components/live2d-viewer/live2d-viewer";
import {RoomWebsocketConnector} from "@/components/room-websocket-connector";
import {useRouter} from "next/navigation";

const Live2dViewer = dynamic(() => import('../../components/live2d-viewer/live2d-viewer').then(mod => mod.Live2dViewer), {ssr: false});

export default function LivePage() {
    const [scriptCoreLoaded, setScriptCoreLoaded] = useState(false)
    const [scriptLive2dLoaded, setScriptLive2dLoaded] = useState(false)
    const [live2dApi, setLive2dApi] = useState({} as Live2dViewerApi)
    const router = useRouter();
    useEffect(() => {
        // 登录校验
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem("token");
            if (!token) {
                router.replace("/login");
            }
        }
        setLive2dApi({
            ...live2dApi,
            setApi: setLive2dApi
        })
    }, []);

    return (
        <>

            <Script src={"/CubismSdkForWeb-5-r.3/Core/live2dcubismcore.js"} strategy="afterInteractive"
                    onReady={() => {
                        setScriptCoreLoaded(true)
                        console.log("core loaded")
                    }}/>
            <Script src={"/live2d.min.js"} strategy="afterInteractive" onReady={() => {
                console.log("live2d loaded")
                setScriptLive2dLoaded(true)
            }}/>

            {scriptCoreLoaded && scriptLive2dLoaded &&
                <div className="w-100vw h-100vh absolute left-0 right-0 top-0 bottom-0 ">
                    <RoomWebsocketConnector live2dApi={live2dApi}/>
                    <ResizablePanelGroup direction="horizontal" className={"w-full h-full"}>
                        <ResizablePanel defaultSize={80}>
                            <div className={"relative w-full h-full"}>
                                <div className={"absolute left-0 top-0 right-0 bottom-0 bg-black"}/>
                                <div
                                    className={"relative bg-transparent w-full h-full left-0 top-0 bottom-0 right-0 overflow-hidden"}>
                                    <Draggable>
                                        <Live2dViewer api={live2dApi}/>
                                    </Draggable>
                                </div>
                                <Toaster/>
                                <Subtitle/>
                            </div>
                        </ResizablePanel>
                        <ResizableHandle/>
                        <ResizablePanel defaultSize={20} minSize={10}>
                            <ChatBox/>
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </div>}
        </>

    );
}