import { PredictionWallet, PredictionWallet__factory } from "../src/types";
import { ethers } from "hardhat";

const {CRP} = process.env;

const main = async () => {
  const Wallet: PredictionWallet__factory = (await ethers.getContractFactory("PredictionWallet")) as PredictionWallet__factory;
  const wallet: PredictionWallet = await Wallet.deploy(CRP!);
  const boss = await (await ethers.getSigners())[0].getAddress();
  
  await wallet.grantRole(ethers.utils.formatBytes32String("winnerPredictionPool"), boss);
  await wallet.grantRole(ethers.utils.formatBytes32String("loserPredictionPool"), boss);

  console.log("Prediction Wallet deployed to "+wallet.address);

  
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

