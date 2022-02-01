import { ethers, upgrades } from "hardhat"

async function main() {
  // We get the contract to deploy
  const CRPAddress = process.env.CRP;
  const operator = process.env.OPERATOR;
  const CRPPerBlock = process.env.CRP_PER_BLOCK;
  const maxDeposit = process.env.MAX_DEPOSIT;
  const predictionAddress = process.env.PREDICTION;

  const wallet = await ethers.getContractAt(
    "PredictionWallet",
    process.env.WALLET || "",
  );

  const WinnerFarm = await ethers.getContractFactory("WinnerPredictionPool");

  const loserFarm = await upgrades.deployProxy(
    WinnerFarm, [
      operator, CRPAddress,
      CRPPerBlock,
      0, 
      maxDeposit, 
      wallet.address, 
      predictionAddress
    ], {kind: "uups"});
  
  await wallet.grantRole(ethers.utils.formatBytes32String("winnerPredictionPool"), loserFarm.address);

  console.log(`WinnerPredictionPool deployed to: ${loserFarm.address}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
