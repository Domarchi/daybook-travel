// La aritmética de fechas del sistema. Trabaja con cadenas AAAA-MM-DD y fija el
// mediodía UTC para que ningún cambio de horario mueva un día.
// El calendario de turnos vive en cycles.ts; aquí solo queda sumar días.
export function addDays(date:string, days:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
