// Quick test to verify PromptPay QR payload
const f = (id, val) => {
    const len = val.length.toString().padStart(2, '0');
    return `${id}${len}${val}`;
};

const crc16 = (data) => {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) > 0) crc = (crc << 1) ^ 0x1021;
            else crc <<= 1;
        }
    }
    return crc & 0xFFFF;
};

const generatePayload = (id, amount) => {
    const isPhone = id.length === 10 && id.startsWith('0');
    let formattedId = id;
    if (isPhone) formattedId = '0066' + id.substring(1);

    const merchantInfo = f('00', 'A000000677010111') + f(isPhone ? '01' : '02', formattedId);

    const payload = [
        f('00', '01'),
        f('01', amount > 0 ? '12' : '11'),
        f('29', merchantInfo),
        f('53', '764'),
        ...(amount > 0 ? [f('54', amount.toFixed(2))] : []),
        f('58', 'TH'),
    ].join('') + '6304';

    const crc = crc16(payload).toString(16).toUpperCase().padStart(4, '0');
    return payload + crc;
};

const result = generatePayload('0966674523', 100);
console.log('Payload:', result);
console.log('Length:', result.length);

// Expected format breakdown:
// 000201 - format indicator
// 010212 - dynamic QR
// 2937 - tag 29, len 37
//   0016A000000677010111 - AID
//   01130066966674523 - phone
// 5303764 - THB currency
// 5406100.00 - amount 100.00
// 5802TH - country
// 6304XXXX - CRC