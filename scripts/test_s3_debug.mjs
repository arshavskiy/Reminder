const secret = process.env.AWS_SECRET_ACCESS_KEY ?? "";
console.log("Secret length:", secret.length);
console.log("Secret (first 20):", secret.slice(0, 20));
console.log("Secret (last 10):", secret.slice(-10));
console.log("Contains +:", secret.includes("+"));
console.log("Contains space:", secret.includes(" "));
console.log("Raw bytes (last 15):", Buffer.from(secret.slice(-15)).toString("hex"));

const accessKey = process.env.AWS_ACCESS_KEY_ID ?? "";
console.log("\nAccess key length:", accessKey.length);
console.log("Access key (first 20):", accessKey.slice(0, 20));
