import React, {useState} from "react";

export function Draggable({children, defaultX = 100, defaultY = 100}: {
    children: React.ReactNode,
    defaultX?: number,
    defaultY?: number
}) {
    const [position, setPosition] = useState({x: defaultX, y: defaultY})
    const [isDragging, setIsDragging] = useState(false)

    return <div onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                onMouseMove={e => {
                    if (isDragging) {
                        setPosition({
                            x: position.x + e.movementX,
                            y: position.y + e.movementY
                        })
                    }

                }} className={"absolute active:cursor-pointer w-[500px] h-[700px]"}
                style={{top: position.y, left: position.x}}>
        {children}
    </div>
}