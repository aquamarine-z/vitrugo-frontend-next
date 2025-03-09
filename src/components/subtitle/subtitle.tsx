import {useAtom} from "jotai";
import {ChatStore} from "@/app/store/chat-store";

export function Subtitle(){
    const [chatStore]=useAtom(ChatStore)
    return <div className={"absolute bottom-0 left-0 right-0 h-8 bg-transparent flex items-center justify-center"}>
        <div className={"bg-background/10 text-lg text-center w-fit h-full py-1 px-3 rounded-md"}>
            <p className={"text-background/80"}>
                {chatStore.subtitleVisible?chatStore.subtitle:""}
            </p>
            
        </div>
    </div>
}