import {useNavigate} from 'react-router-dom'
import {useEffect, useRef, useState} from "react";

const ARROW = null; // set ARROW to path /arrow.png later
const TEMPARROW = "->"; // temp

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
        <div ref = {wrap} tabIndex = {0} onKeyDown = {onKeyDown} style = {{
            minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, outline: "none",}}
            aria-label = "Main Menu" role = "menu"
            >
            
            <div style = {{width: "100%", maxWidth: 520}}
            >
                <h1 style = {{textAlign: "center", margin: "8px 0 18px"}}>Combat Vision</h1>

                {/* Menu item*/}
                <div style ={{display: "grid", gridTemplateColumns:"40px 1fr", gap:8, alignItems: "center",}}
                >
                
                    {LIST.map((item, i) => {
                        const selected = i === index;

                        return(
                            <div 
                                key = {item.label} role = "menuitem" aria-selected = {selected} 
                                onMouseEnter = {() => setIndex(i)} onClick = {() => nav(item.path)}
                                style = {{display: "contents", cursor: "pointer",}}
                            >
                                <div style = {{height: 44, display: "grid", placeItems: "center"}}>
                                    {selected ? (
                                        ARROW ? (
                                            <img src = {ARROW} alt = "" style = {{height: 24, width: 24, objectFit: "contain"}} />
                                        ) : (
                                            <span style = {{fontSize: 22, lineHeight:1}}>{TEMPARROW}</span>
                                        )
                                    ) : null}
                                </div>

                                {/*Label Column*/}
                                <div style = {{
                                    height:44,display:"grid",alignItems:"center",padding:"0 14px",borderRadius:10,border:selected ? "1px solid rgba (255,255,255,0.35)":"1px solid rgba(255,255,255,0.15)", background:selected ? "rgba(255,255,255,0.1)":"rgba(255,255,255,0.06)",position:"background 0.15s ease,border-color 0.15s ease",userSelect:"none",
                                }}
                                >
                                    <span style={{fontSize:18}}>{item.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p style={{textAlign:"center",opacity:0.7,marginTop:12,fontSize:12}}>
                    use <b>up/down</b> (or <b>w/s</b>) to select | Press <b>enter</b> to proceed
                </p>
            </div>
        </div>
    );
}

    
