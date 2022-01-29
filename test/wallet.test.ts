import { expect } from "chai";
import { ethers } from "hardhat"
import { Signer, Contract, BigNumber as _BigNumber, BigNumber, ContractFactory } from "ethers";
import { PredictionWallet, PredictionWallet__factory, CRP, CRP__factory } from "../src/types";

let Wallet: PredictionWallet__factory, wallet: PredictionWallet, PrederA: Signer,  PrederB: Signer, crp: CRP, CRPFactory: CRP__factory;

describe("Prediction pools Wallet Tests", () => {
  beforeEach( async () => {
    CRPFactory = (await ethers.getContractFactory("CRP")) as CRP__factory;
    crp = await CRPFactory.deploy()
    Wallet = (await ethers.getContractFactory("PredictionWallet")) as PredictionWallet__factory;
    wallet = await Wallet.deploy(crp.address);
    crp.transfer(wallet.address, 1000000);

    const signers = await ethers.getSigners();
    [PrederA, PrederB] = signers;

    await wallet.grantRole(
      ethers.utils.formatBytes32String("winnerPredictionPool"), 
      await PrederA.getAddress()
    );
  })

  it("should allow Owner send Pred", async () => {
    await expect(async () => wallet.safeCRPTransfer(await PrederB.getAddress(), 10000))
      .to.changeTokenBalances(
        crp, [wallet, PrederB], [-10000, 10000]
    )
  })

  it("should allow onlyOwner send Pred", async () => {
    await expect(wallet.safeCRPTransfer(
      await PrederB.getAddress(), 10000, {from: await PrederB.getAddress()}
      )
    ).to.be.reverted;
  })
})