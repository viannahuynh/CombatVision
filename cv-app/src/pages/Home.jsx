import {useNavigate} from 'react-router-dom'
import {useEffect, useRef, useState} from "react";

const ARROW = {path: "/arrow.png"}; // set ARROW to path /arrow.png later

const LIST = [{label: "Play", path: "/play"}, {label: "Credits", path: "/credits"}, {label:"Exit", path: "/exit"},];

// landing page 
export default function Home() {
    const nav = useNavigate()
    const [index, setIndex] = useState(0);
    const wrap = useRef(null);

    useEffect(() => {wrap.current?.focus();}, []);

    // arrow buttons
    const onKeyDown = (e) => {
        if(e.key === "ArrowDown" || e.key === "ArrowUp") e.preventDefault();
        if(e.key === "ArrowDown" || e.key === "s") setIndex((i) => (i + 1) % LIST.length);
        else if(e.key === "ArrowUp" || e.key === "w") setIndex((i) => (i - 1 + LIST.length) % LIST.length);
        else if(e.key === "Enter") nav(LIST[index].path);
        }
    
    return (
        <div ref={wrap} tabIndex={0} onKeyDown={onKeyDown} style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 16,
            outline: "none",
            backgroundImage: "url('/menu/title.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        }}
            aria-label="Main Menu" role="menu"
        >
        </div>
    );
}

    
