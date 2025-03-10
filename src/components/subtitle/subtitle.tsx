import {useAtom} from "jotai";
import {RoomStateStore} from "@/store/room-state-store";

export function Subtitle() {
    const [chatStore] = useAtom(RoomStateStore)
    return chatStore.subtitleVisible ?
        <div className={"absolute bottom-0 left-0 right-0 h-8 bg-transparent flex items-center justify-center"}>
            <div className={"bg-background/10 text-lg text-center w-fit h-full py-1 px-3 rounded-md"}>
                <p className={"text-background/80"}>
                    {chatStore.subtitleVisible ? chatStore.subtitle : ""}
                </p>

            </div>
        </div> : <></>
}