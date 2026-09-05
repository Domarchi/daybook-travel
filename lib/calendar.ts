export function addDays(date:string, days:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function pulseDates(start:string,end:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw new Error('Revisa el período.');
 if(new Date(start+'T12:00:00Z').getUTCDay()!==1)throw new Error('La primera subida debe ser un lunes.');
 const out:{date:string;direction:string}[]=[];
 for(let d=start;d<=end;d=addDays(d,7)){out.push({date:d,direction:'SUBIDA'});const down=addDays(d,3);if(down<=end)out.push({date:down,direction:'BAJADA'});if(out.length>1100)throw new Error('Selecciona un período menor a diez años.');}
 return out;
}
