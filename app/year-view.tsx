'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {addDays} from '../lib/calendar';
type Travel={id:string;date:string;person_id:string;direction:string;origin:string;destination:string;status:string;requested_time:string|null};
type Member={id:string;name:string;shift:string};
const longDate=(date:string)=>new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00Z'));
export default function YearView({trips,people,onWeek,onTrip,onAdd,mode,week,onChangeWeek,selected,onSelect}:{selected:string|null;onSelect:(d:string|null)=>void;mode:string;week:string;onChangeWeek:(d:string)=>void;trips:Travel[];people:Member[];onWeek:(date:string)=>void;onTrip:(id:string)=>void;onAdd:(date:string)=>void}){
 const detailRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(selected){const frame=requestAnimationFrame(()=>detailRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'}));return()=>cancelAnimationFrame(frame)}},[selected]);
 const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
 const [currentDay,setCurrentDay]=useState(localToday);
 const [month,setMonth]=useState(()=>localToday().slice(0,7));
 const [hovered,setHovered]=useState<string|null>(null);
 const [shift,setShift]=useState('Todos');
 useEffect(()=>{const timer=setInterval(()=>setCurrentDay(localToday()),60000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{if(selected)setMonth(selected.slice(0,7));setHovered(null)},[selected]);
 const year=Number(month.slice(0,4));
 function navigateMonth(next:string){if(!/^\d{4}-\d{2}$/.test(next))return;setMonth(next);onSelect(null);setHovered(null)}
 function moveMonth(delta:number){const d=new Date(month+'-01T12:00Z');d.setUTCMonth(d.getUTCMonth()+delta);if(d.getUTCFullYear()<1||d.getUTCFullYear()>9999)return;navigateMonth(d.toISOString().slice(0,7))}
 function goToday(){const d=localToday();setCurrentDay(d);setMonth(d.slice(0,7));onSelect(d)}
 const members=useMemo(()=>new Map(people.map(p=>[p.id,p])),[people]);
 const byDay=useMemo(()=>{const result=new Map<string,Travel[]>();for(const t of trips){if(t.status==='Anulado'||(shift!=='Todos'&&members.get(t.person_id)?.shift!==shift))continue;const rows=result.get(t.date)??[];rows.push(t);result.set(t.date,rows)}return result},[trips,members,shift]);
 const monthStart=month+'-01';
 const gap=(new Date(monthStart+'T12:00Z').getUTCDay()+6)%7;
 const monthEnd=new Date(monthStart+'T12:00Z');monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1);monthEnd.setUTCDate(0);
 const length=monthEnd.getUTCDate();
 const rows=selected?byDay.get(selected)??[]:[];
 const active=hovered||selected;
 const activeRows=active?byDay.get(active)??[]:[];
 const annual=[...byDay].filter(([d])=>d.startsWith(month));
 const both=annual.filter(([,ts])=>new Set(ts.map(t=>members.get(t.person_id)?.shift)).size>1).length;
 function kind(d:string){const shifts=new Set((byDay.get(d)??[]).map(t=>members.get(t.person_id)?.shift));return shifts.has('4×3')&&shifts.has('10×10')?'both':shifts.has('4×3')?'pulse':shifts.has('10×10')?'cross':'none'}

 return <section className="annual single-month"><div className="annual-top"><div><h2>{new Intl.DateTimeFormat('es-CL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(monthStart+'T12:00Z'))}</h2><p>Elige una fecha para ver sus pasajeros o agregar un viaje.</p></div><div className="annual-controls"><select aria-label="Filtrar turno" value={shift} onChange={e=>setShift(e.target.value)}><option value="Todos">Todos los turnos</option><option>4×3</option><option>10×10</option></select><div className="month-navigation"><button aria-label="Mes anterior" onClick={()=>moveMonth(-1)}>←</button><input aria-label="Ir a mes y año" type="month" min="0001-01" max="9999-12" value={month} onInput={e=>navigateMonth(e.currentTarget.value)} onChange={e=>navigateMonth(e.target.value)}/><button aria-label="Mes siguiente" onClick={()=>moveMonth(1)}>→</button><button onClick={goToday}>Hoy</button></div></div></div><div className="year-surface"><div className="year-legend"><span><i className="pulse"/>Turno 4×3</span><span><i className="cross"/>Turno 10×10</span><span><i className="both"/>Ambos turnos</span><span><i className="none"/>Sin viajes</span><span className="year-readout" aria-live="polite">{active?`${longDate(active)} · ${activeRows.length} ${activeRows.length===1?'viaje':'viajes'}`:'Cada cuadro representa un día'}</span></div><div className="month-cells full-month">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><span className="month-weekday" key={day}>{day}</span>)}{Array.from({length:gap},(_,i)=><span className="calendar-gap" key={'gap'+i}/>)}{Array.from({length},(_,i)=>{const d=addDays(monthStart,i);const n=byDay.get(d)?.length??0;return <button key={d} title={longDate(d)+': '+n+' viajes'} aria-label={longDate(d)+' '+year+': '+n+(n===1?' viaje':' viajes')+(d===currentDay?' · Hoy':'')} aria-current={d===currentDay?'date':undefined} aria-pressed={selected===d} className={'year-cell month-cell '+kind(d)+(selected===d?' chosen':'')+(d===currentDay?' current-day':'')} onClick={()=>onSelect(d)} onMouseEnter={()=>setHovered(d)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(d)} onBlur={()=>setHovered(null)}><span>{i+1}</span>{d===currentDay&&<em>Hoy</em>}<small>{n>0?n+(n===1?' viaje':' viajes'):'—'}</small></button>})}</div></div><div className="annual-summary"><span>{annual.length} días con viajes</span><span>{both} días con ambos turnos</span><small>El 10×10 muestra las fechas registradas. Los viajes anulados no se cuentan.</small></div>{selected?<section ref={detailRef} className="day-detail"><div className="day-detail-head"><div><span className="eyebrow">DÍA SELECCIONADO</span><h3>{longDate(selected)}</h3></div><div><button className="primary" onClick={()=>onAdd(selected)}>+ Agregar viaje</button></div></div>{rows.length?<div className="day-travellers">{rows.map(t=><button key={t.id} onClick={()=>onTrip(t.id)}><span className={'travel-arrow '+(t.direction==='SUBIDA'?'pulse':'cross')}>{t.direction==='SUBIDA'?'↗':'↙'}</span><span><strong>{members.get(t.person_id)?.name??'Persona'}</strong><small>{t.origin} → {t.destination}</small></span><span className="day-trip-time">{t.requested_time?.slice(0,5)||'Hora por definir'}<small>{members.get(t.person_id)?.shift}</small></span><span className="badge">{t.status}</span><span>→</span></button>)}</div>:<p className="day-empty">No hay viajes registrados para este día.</p>}</section>:<div className="year-instruction">Haz clic en cualquier día para ver personas, horarios y reservas.</div>}</section>;
}
