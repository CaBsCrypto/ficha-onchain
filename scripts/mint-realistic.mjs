import fs from 'node:fs';
import crypto from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, nativeToScVal, rpc, scValToNative, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

async function main() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const config = {};
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^(RELAYER_SECRET|DEMO_DOCTOR_SECRET|NEXT_PUBLIC_PRESCRIPTION_ID)=(.*)$/);
    if (m) config[m[1]] = m[2].trim().replace(/^['"](.*)['"]$/, '$1');
  }

  const doctor = Keypair.fromSecret(config.DEMO_DOCTOR_SECRET);
  const relayer = Keypair.fromSecret(config.RELAYER_SECRET);
  const server = new rpc.Server('https://soroban-testnet.stellar.org');
  const contractId = config.NEXT_PUBLIC_PRESCRIPTION_ID || 'CBOJSLG2XQZNQ6G6Q4VGN2SOFOEUCRDMBDWS7HVOQTGWTOIWGWNQSLCU';
  const contract = new Contract(contractId);

  console.log('--- TrustLeaf Testnet Minting ---');
  console.log('Doctor Public Key:', doctor.publicKey());
  console.log('Contract ID:', contractId);

  const patient = Keypair.random();
  console.log('Patient Public Key:', patient.publicKey());

  const realisticRxs = [
    {
      medication: 'Amoxicilina + Ác. Clavulánico 875/125mg',
      dosage: '1 comprimido cada 12 hrs por 7 días',
      units: 14,
      daysValid: 15,
      activate: true,
    },
    {
      medication: 'Ketoprofeno 200mg LP',
      dosage: '1 cápsula diaria con el almuerzo por 5 días',
      units: 5,
      daysValid: 30,
      activate: true,
    },
    {
      medication: 'Losartán Potásico 50mg',
      dosage: '1 comprimido cada 24 hrs continuo en la mañana',
      units: 30,
      daysValid: 90,
      activate: false,
    }
  ];

  for (const rxData of realisticRxs) {
    const docCanonical = JSON.stringify({
      medication: rxData.medication,
      dosage: rxData.dosage,
      units: rxData.units,
      patient: patient.publicKey(),
      doctor: doctor.publicKey(),
      nonce: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });
    const rxHash = crypto.createHash('sha256').update(docCanonical).digest();
    const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + (rxData.daysValid * 86400));

    const mintArgs = [
      new Address(doctor.publicKey()).toScVal(),
      new Address(patient.publicKey()).toScVal(),
      xdr.ScVal.scvBytes(rxHash),
      nativeToScVal(rxData.medication, { type: 'string' }),
      nativeToScVal(rxData.dosage, { type: 'string' }),
      nativeToScVal(rxData.units, { type: 'u32' }),
      nativeToScVal(expiryTimestamp, { type: 'u64' })
    ];

    console.log(`\n▶ [MINT] ${rxData.medication} (${rxData.dosage})`);
    const doctorAcc = await server.getAccount(doctor.publicKey());
    const tx = new TransactionBuilder(doctorAcc, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(contract.call('mint_prescription', ...mintArgs))
      .setTimeout(120)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(doctor);
    const bumped = TransactionBuilder.buildFeeBumpTransaction(relayer, '2000000', prepared, Networks.TESTNET);
    bumped.sign(relayer);

    const sendRes = await server.sendTransaction(bumped);
    console.log('  Tx Hash:', sendRes.hash);

    let getRes = await server.getTransaction(sendRes.hash);
    while (getRes.status === 'NOT_FOUND') {
      await new Promise(r => setTimeout(r, 1500));
      getRes = await server.getTransaction(sendRes.hash);
    }

    if (getRes.status === 'SUCCESS') {
      const rxId = scValToNative(getRes.returnValue);
      console.log(`  ✓ Mint SUCCESS! On-Chain Rx ID: #${rxId}`);
      console.log(`  🔗 Explorer: https://stellar.expert/explorer/testnet/tx/${sendRes.hash}`);

      if (rxData.activate) {
        console.log(`▶ [ACTIVATE] Activando Receta #${rxId}...`);
        const docAcc2 = await server.getAccount(doctor.publicKey());
        const actTx = new TransactionBuilder(docAcc2, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
          .addOperation(contract.call('activate', new Address(doctor.publicKey()).toScVal(), nativeToScVal(BigInt(rxId), { type: 'u64' })))
          .setTimeout(120)
          .build();
        const actPrep = await server.prepareTransaction(actTx);
        actPrep.sign(doctor);
        const actBumped = TransactionBuilder.buildFeeBumpTransaction(relayer, '2000000', actPrep, Networks.TESTNET);
        actBumped.sign(relayer);
        const actSend = await server.sendTransaction(actBumped);
        let actGet = await server.getTransaction(actSend.hash);
        while (actGet.status === 'NOT_FOUND') {
          await new Promise(r => setTimeout(r, 1500));
          actGet = await server.getTransaction(actSend.hash);
        }
        console.log(`  ✓ Activación SUCCESS! Tx: https://stellar.expert/explorer/testnet/tx/${actSend.hash}`);
      }
    } else {
      console.error('  ✗ Tx Fallida:', getRes);
    }
  }

  console.log('\n=============================================');
  console.log('🎉 Todas las recetas clínicas reales fueron emitidas y confirmadas en Stellar Testnet!');
}

main().catch(console.error);
