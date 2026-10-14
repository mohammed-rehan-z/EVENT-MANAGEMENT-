const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log("=== FORENSIC AUDIT EMPIRICAL VERIFICATION ===");

// 1. Check timestamps of modified files
const filesToCheck = [
  'src/lib/services/authService.ts',
  'src/app/actions/authActions.ts',
  'src/lib/dataStore.ts',
  'src/lib/services/cryptoService.ts',
  'src/app/page.tsx',
  'src/app/(admin)/events/[eventId]/layout.tsx',
  'src/app/(admin)/events/page.tsx',
  'src/app/(volunteer)/layout.tsx',
  'src/app/actions/importData.ts',
  'src/proxy.ts',
  'src/app/api/webhook/google-forms/route.ts',
  'schema.sql',
  'data/events-data.json'
];

console.log("\n--- File Modification Timestamps ---");
filesToCheck.forEach(relPath => {
  const fullPath = path.join(process.cwd(), relPath);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    console.log(`${relPath}: ${stat.mtime.toISOString()} (${stat.size} bytes)`);
  } else {
    console.log(`${relPath}: NOT FOUND`);
  }
});

// 2. Cryptographic PBKDF2 Verification
console.log("\n--- PBKDF2 Cryptographic Verification ---");
const testPassword = "testPassword!2026";
const saltHex = crypto.randomBytes(32).toString("hex");
console.log(`Generated Salt: ${saltHex} (length: ${saltHex.length} hex chars = ${saltHex.length / 2} bytes)`);

crypto.pbkdf2(testPassword, saltHex, 100000, 64, "sha512", (err, derivedKey) => {
  if (err) throw err;
  const hashHex = derivedKey.toString("hex");
  console.log(`Derived Hash: ${hashHex} (length: ${hashHex.length} hex chars = ${hashHex.length / 2} bytes)`);

  const saltLengthCheck = saltHex.length === 64;
  const hashLengthCheck = hashHex.length === 128;
  console.log(`Salt is 32 bytes (64 hex): ${saltLengthCheck}`);
  console.log(`Hash is 64 bytes (128 hex): ${hashLengthCheck}`);

  // Test verifyPassword with timingSafeEqual
  const candidateBuf = Buffer.from(hashHex, "hex");
  const storedBuf = Buffer.from(hashHex, "hex");
  const isEqual = crypto.timingSafeEqual(candidateBuf, storedBuf);
  console.log(`timingSafeEqual self-check: ${isEqual}`);

  // Test tampered hash
  const tamperedBuf = Buffer.from(hashHex, "hex");
  tamperedBuf[0] ^= 1; // flip 1 bit
  const isTamperedEqual = crypto.timingSafeEqual(candidateBuf, tamperedBuf);
  console.log(`timingSafeEqual tampered check: ${isTamperedEqual}`);

  // Test DEFAULT_USERS credentials
  console.log("\n--- DEFAULT_USERS Pre-hashed Verification ---");
  const adminSalt = "db1bbed31405ba049ce315e40a8e265b4031ac90772c4fa5bc0e5f8bfa3db0ab";
  const expectedAdminHash = "680e3a63563829fcdf3cd860008179a1b3b947f3109dc6650b752f4c6fc8d5fd61abc88bbffcf100a53113f6fea5d18dab468c39b60751261b3058b42fea33de";

  crypto.pbkdf2("admin123", adminSalt, 100000, 64, "sha512", (err2, adminDerived) => {
    if (err2) throw err2;
    const computedAdminHash = adminDerived.toString("hex");
    const adminMatch = crypto.timingSafeEqual(Buffer.from(computedAdminHash, "hex"), Buffer.from(expectedAdminHash, "hex"));
    console.log(`admin123 PBKDF2 matches stored hash: ${adminMatch}`);

    const volunteerSalt = "7956d5345e097592224035319f4860d392670f9fb43b8108ea2de0120664ef09";
    const expectedVolHash = "c10177b0231ed145ca2935cd240a035f916e5192f2caf9ec71fbec2db011a7ccd9128342eafa1fef455da161d63057a83bb2870ce2b112c7f312b6e6d935a6a5";

    crypto.pbkdf2("volunteer123", volunteerSalt, 100000, 64, "sha512", (err3, volDerived) => {
      if (err3) throw err3;
      const computedVolHash = volDerived.toString("hex");
      const volMatch = crypto.timingSafeEqual(Buffer.from(computedVolHash, "hex"), Buffer.from(expectedVolHash, "hex"));
      console.log(`volunteer123 PBKDF2 matches stored hash: ${volMatch}`);

      // Wrong passwords
      crypto.pbkdf2("wrongpass", adminSalt, 100000, 64, "sha512", (err4, wrongDerived) => {
        if (err4) throw err4;
        const computedWrong = wrongDerived.toString("hex");
        const wrongMatch = crypto.timingSafeEqual(Buffer.from(computedWrong, "hex"), Buffer.from(expectedAdminHash, "hex"));
        console.log(`wrong password fails: ${!wrongMatch}`);

        console.log("\n=== FORENSIC CHECKS COMPLETE ===");
      });
    });
  });
});
