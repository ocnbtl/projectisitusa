import { crc32, inflateRawSync } from 'node:zlib';
function requireZip(value: unknown, message: string): asserts value { if (!value)
    throw new Error('Retained CSV ZIP: ' + message); }
// Narrow in-memory reader for one unencrypted, non-ZIP64 CSV entry. It never extracts paths.
// Format: PKWARE APPNOTE 6.3.10 sections 4.3.7, 4.3.9, 4.3.12 and 4.3.16.
export function decodeSingleCsvZip(bytes: Buffer, maximumBytes = 20000000): {
    name: string;
    bytes: Buffer;
    crc32: number;
} {
    requireZip(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 20000000, 'invalid output cap');
    requireZip(bytes.length >= 22 && bytes.length <= 20000000, 'archive size outside cap');
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {
            end = i;
            break;
        }
    }
    requireZip(end >= 0, 'missing complete end record');
    requireZip(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0 && bytes.readUInt16LE(end + 8) === 1 && bytes.readUInt16LE(end + 10) === 1, 'requires one entry on one disk');
    const central = bytes.readUInt32LE(end + 16), centralSize = bytes.readUInt32LE(end + 12);
    requireZip(central >= 30 && central + 46 <= end && central + centralSize === end, 'central directory bounds differ');
    requireZip(bytes.readUInt32LE(central) === 0x02014b50, 'invalid central signature');
    const version = bytes.readUInt16LE(central + 6), flags = bytes.readUInt16LE(central + 8), method = bytes.readUInt16LE(central + 10), crc = bytes.readUInt32LE(central + 16), compressed = bytes.readUInt32LE(central + 20), size = bytes.readUInt32LE(central + 24);
    const nameLength = bytes.readUInt16LE(central + 28), extraLength = bytes.readUInt16LE(central + 30), commentLength = bytes.readUInt16LE(central + 32);
    requireZip(version <= 20 && (flags & ~0x0808) === 0 && (method === 0 || method === 8), 'unsupported version, flags or compression');
    requireZip(bytes.readUInt16LE(central + 34) === 0 && bytes.readUInt32LE(central + 42) === 0, 'split or prefixed entry');
    requireZip(size > 0 && size <= maximumBytes && compressed > 0 && compressed <= bytes.length, 'entry size outside cap');
    requireZip(central + 46 + nameLength + extraLength + commentLength === end, 'central record size differs');
    const nameBytes = bytes.subarray(central + 46, central + 46 + nameLength), name = nameBytes.toString('utf8');
    requireZip(/^[A-Za-z0-9_-]+\.csv$/.test(name) && Buffer.from(name, 'utf8').equals(nameBytes), 'requires one literal CSV leaf name');
    const extras = (start: number, length: number) => { const stop = start + length; for (let p = start; p < stop;) {
        requireZip(p + 4 <= stop, 'truncated extra field');
        const id = bytes.readUInt16LE(p), n = bytes.readUInt16LE(p + 2);
        requireZip(id !== 1 && p + 4 + n <= stop, 'ZIP64 or truncated extra field');
        p += 4 + n;
    } };
    extras(central + 46 + nameLength, extraLength);
    requireZip(bytes.readUInt32LE(0) === 0x04034b50 && bytes.readUInt16LE(4) === version && bytes.readUInt16LE(6) === flags && bytes.readUInt16LE(8) === method, 'local header differs');
    const localNameLength = bytes.readUInt16LE(26), localExtraLength = bytes.readUInt16LE(28), dataStart = 30 + localNameLength + localExtraLength, dataEnd = dataStart + compressed;
    requireZip(localNameLength === nameLength && dataStart <= central && dataEnd <= central && bytes.subarray(30, 30 + localNameLength).equals(nameBytes), 'local name or data bounds differ');
    extras(30 + localNameLength, localExtraLength);
    const localValues = [bytes.readUInt32LE(14), bytes.readUInt32LE(18), bytes.readUInt32LE(22)], expected = [crc, compressed, size];
    if (flags & 8) {
        requireZip(localValues.every((n, i) => n === 0 || n === expected[i]), 'local streaming sizes differ');
        const descriptorLength = central - dataEnd;
        requireZip(descriptorLength === 12 || descriptorLength === 16, 'descriptor size differs');
        const offset = descriptorLength === 16 ? 4 : 0;
        requireZip(offset === 0 || bytes.readUInt32LE(dataEnd) === 0x08074b50, 'descriptor signature differs');
        requireZip(expected.every((n, i) => bytes.readUInt32LE(dataEnd + offset + 4 * i) === n), 'descriptor values differ');
    }
    else
        requireZip(dataEnd === central && localValues.every((n, i) => n === expected[i]), 'local sizes or entry end differ');
    let decoded: Buffer;
    if (method === 0) {
        requireZip(compressed === size, 'stored size differs');
        decoded = Buffer.from(bytes.subarray(dataStart, dataEnd));
    }
    else {
        const result = inflateRawSync(bytes.subarray(dataStart, dataEnd), { maxOutputLength: maximumBytes, info: true }) as unknown as {
            buffer: Buffer;
            engine: {
                bytesWritten: number;
            };
        };
        requireZip(result.engine.bytesWritten === compressed, 'trailing deflate bytes');
        decoded = result.buffer;
    }
    requireZip(decoded.length === size && crc32(decoded) === crc, 'decoded length or CRC differs');
    return { name, bytes: decoded, crc32: crc };
}
