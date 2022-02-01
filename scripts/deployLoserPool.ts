import { ethers, upgrades } from "hardhat"

async function main() {
  // We get the contract to deploy
  const CRPAddress = process.env.CRP;
  const MMFAddress = process.env.MMF;
  const operator = process.env.OPERATOR;
  const MMFPerBlock = process.env.MMF_PER_BLOCK;
  const maxDeposit = process.env.MAX_DEPOSIT;
  const predictionAddress = process.env.PREDICTION;

  const wallet = await ethers.getContractAt(
    "PredictionWallet",
    process.env.WALLET || "",
  );

  const LoserFarm = await ethers.getContractFactory("LoserPredictionPool");

  const loserFarm = await upgrades.deployProxy(
    LoserFarm, [
      operator, CRPAddress,
      MMFAddress,
      MMFPerBlock,
      0, 
      maxDeposit, 
      wallet.address, 
      predictionAddress
    ], {kind: "uups"});
  
  await wallet.grantRole(ethers.utils.formatBytes32String("loserPredictionPool"), loserFarm.address);

  console.log(`LoserPredictionPool deployed to: ${loserFarm.address}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
