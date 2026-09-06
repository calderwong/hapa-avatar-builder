import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import EchoKanbanBoard from '../../src/components/EchoKanbanBoard.jsx';
function Proof(){
 const [board,setBoard]=useState(null),[notice,setNotice]=useState('');
 useEffect(()=>{fetch('/api/echos/kanban').then(response=>response.json()).then(setBoard);},[]);
 useEffect(()=>{window.boardProofState=board;window.boardProofNotice=notice;},[board,notice]);
 return <><EchoKanbanBoard board={board} apiBase="" onBoardChange={setBoard} onNotice={setNotice}/><p id="notice" role="status">{notice}</p></>;
}
createRoot(document.getElementById('root')).render(<Proof/>);
