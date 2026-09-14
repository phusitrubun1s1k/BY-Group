export function validateMatchInput(teamA: string[], teamB: string[], court: string, sequence: string, shuttle: string): string[] {
    const errors: string[] = [];
    if (teamA.length !== 2) errors.push('ทีม A ต้องมีผู้เล่น 2 คน');
    if (teamB.length !== 2) errors.push('ทีม B ต้องมีผู้เล่น 2 คน');
    if (new Set([...teamA, ...teamB]).size !== teamA.length + teamB.length) errors.push('ผู้เล่นต้องไม่ซ้ำกัน');
    if (!court.trim()) errors.push('กรุณาระบุคอร์ท');
    if (!/^[1-9]\d*$/.test(sequence.trim()) || !Number.isSafeInteger(Number(sequence))) errors.push('ลำดับแมตช์ต้องเป็นจำนวนเต็มมากกว่า 0');
    if (!shuttle.trim()) errors.push('กรุณาระบุหมายเลขลูก');
    return errors;
}

export function preserveShuttles(original: readonly string[], first: string): string[] {
    return [first.trim(), ...original.slice(1).map(value => value.trim())].filter(Boolean);
}
