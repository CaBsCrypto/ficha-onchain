import { describe, expect, it } from 'vitest';
import { formatClinicalFileSize } from '@/components/private-portal/clinical-file-size';
describe('readable original clinical file sizes',()=>{
 it.each([[0,'0 bytes'],[1,'1 byte'],[964,'964 bytes'],[1000,'1 kB (1.000 bytes)'],[1500,'1,5 kB (1.500 bytes)'],[1_000_000,'1 MB (1.000.000 bytes)'],[3_000_000,'3 MB (3.000.000 bytes)']] as const)('displays %s without losing its exact byte count', (bytes,label)=>expect(formatClinicalFileSize(bytes)).toBe(label));
 it.each([NaN,Infinity,-1,.5])('does not present an invalid size as zero (%s)',bytes=>expect(formatClinicalFileSize(bytes)).toBe('Tamaño no disponible'));
});
