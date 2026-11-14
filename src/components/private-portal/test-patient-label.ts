export function testPatientLabel(name: string, english: boolean) {
  return english && name === 'Paciente de prueba TrustLeaf' ? 'TrustLeaf test patient' : name;
}
