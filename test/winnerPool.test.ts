import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat"
import { Signer, Contract, BigNumber as _BigNumber, BigNumber, ContractFactory } from "ethers";
import { 
  WinnerPredictionPool, WinnerPredictionPool__factory, 
  Prediction, Prediction__factory, 
  PredictionWallet, PredictionWallet__factory,
  CRP, CRP__factory,
} from "../src/types";

let signers: Signer[], 
  farm: WinnerPredictionPool, 
  PrederA: Signer, 
  crp: CRP,
  PrederB: Signer,
  Farm: WinnerPredictionPool__factory,
  wallet: PredictionWallet,
  prediction: Prediction,
  PredictionFactory: Prediction__factory,
  Wallet: PredictionWallet__factory;
const predPerBlock = 1000000000;
let walletContract: Contract;


let poolBefore: {
        allocPoint: BigNumber;
        lastRewardBlock: BigNumber;
        accCRPPerShare: BigNumber;
        epoch: BigNumber;
        amount: BigNumber;
      };

let [depositA, depositB] = [8883, 9248]
const multiplier = 10000000

async function passInterval(_network: typeof network, prediction:Contract){
  await _network.provider.send("evm_increaseTime", 
    [86500]
  );
  await _network.provider.send("evm_mine");
}

const {BTC,ETH,CRO, DOGE, LTC} = process.env;
const tokens = [BTC, ETH, LTC, CRO, DOGE] as string[];
const startPrices = [3000000, 300000, 14000, 400, 200];
const endPrices = [3000001, 200000, 13000, 100, 900];

describe("Prediction Pool Contract Tests", () => {

  beforeEach( async () => {
    signers = await ethers.getSigners();
    [PrederA, PrederB] = signers

    const CRPFactory: CRP__factory = (await ethers.getContractFactory("CRP")) as CRP__factory;
    crp = await CRPFactory.deploy();

    Wallet = (await ethers.getContractFactory("PredictionWallet")) as PredictionWallet__factory
    wallet = await Wallet.deploy(crp.address);

    PredictionFactory = (await ethers.getContractFactory("Prediction")) as Prediction__factory;
    prediction = (await upgrades.deployProxy(
      PredictionFactory,
      [
        crp.address,
        await PrederA.getAddress(),
        await PrederA.getAddress(),
        86400,
        300,
        300,
        ethers.utils.parseUnits("10"),
        10,
      ],
      { kind: "uups" }
    )) as Prediction;
    await prediction.addTokens(tokens);
    await crp.approve(prediction.address, ethers.constants.MaxUint256);

    Farm = (await ethers.getContractFactory("WinnerPredictionPool")) as WinnerPredictionPool__factory;
    //farm = await Farm.deploy(crp.address, predPerBlock, 0)
    farm = (await upgrades.deployProxy(Farm, [
      await PrederA.getAddress(),
      crp.address, predPerBlock, 0, 
      ethers.utils.parseEther("100"), 
      wallet.address, 
      prediction.address
    ], 
      {kind: "uups"}
    )) as WinnerPredictionPool

    await wallet.grantRole(
      ethers.utils.formatBytes32String("winnerPredictionPool"), 
      farm.address
    );
  })

  it("should initialise contract state variables", async () => {
    expect(await farm.CRP()).to.equal(crp.address);
    expect(await farm.CRPPerBlock()).to.equal(predPerBlock);
    expect(await farm.startBlock()).to.equal(0);
  })

  it("should update multiplier", async () => {
    await farm.updateMultiplier(multiplier)
    expect(await farm.BONUS_MULTIPLIER()).to.equal(multiplier)
  })

  it("should allow only owner add a new pool", async () => {
    await expect(farm.add(0, {from: await PrederB.getAddress()})).to.be.reverted;
  })

  it("should start a new pool", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    //start a new round to increase current epoch
    await prediction.startRound(tokens, startPrices);

    await farm.add(1);
    const pool = await farm.poolInfo(0)
    expect(pool.allocPoint.toString()).to.equal("200");
    expect(pool.epoch).to.equal((await prediction.currentEpoch()).sub("1"));
    expect(pool.accCRPPerShare.toString()).to.equal("0")
  })

  it("should start another pool", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);
    
    //start a new round to increase current epoch
    await prediction.startRound(tokens, startPrices);
    

    await farm.add(1);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    await farm.add(2);
    const pool1 = await farm.poolInfo(0)
    expect(pool1.allocPoint.toString()).to.equal("0");

    const pool2 = await farm.poolInfo(1);
    expect(pool2.allocPoint.toString()).to.equal("200");
    expect(pool2.epoch).to.equal(await prediction.currentEpoch());
  })

  it("should set farm allocation point", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    await farm.add(1);
    await farm.setAllocPoint(10000000);
    const pool = await farm.poolInfo(0);
    expect(pool.allocPoint).to.equal(200);
    expect(await farm.allocPoint()).to.equal(10000000);
  })

  it("should set pool allocation point", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    await farm.add(1);
    await farm.setPoolAllocPoint(10000000);
    const pool = await farm.poolInfo(0);
    expect(pool.allocPoint).to.equal(10000000);
  })

  it("should return multiplier across blocks", async () => {
    const bonus_multiplier = await farm.BONUS_MULTIPLIER()
    expect(await farm.getMultiplier(110, 200)).to.be.equal(bonus_multiplier.mul(200-110))
  })

  context("when user deposits when wallet is empty", async () => {
    beforeEach(async () => {
      await prediction.startRound(tokens, startPrices);
      await prediction.predictBull(1, BTC!);
      await passInterval(network, prediction);
      await prediction.endRound(tokens, endPrices);
  
      await farm.add(1);
      await crp.approve(await farm.address, 100000000)
      await farm.updateMultiplier(multiplier)
      poolBefore = await farm.poolInfo(0)
      depositA = 1000;
      await farm.deposit(0, depositA)
    })

    it("should update user info", async () => {
      const userInfo = await farm.userInfo(0, await PrederA.getAddress())
      expect(userInfo.amount).to.equal(depositA)
      expect(userInfo.rewardDebt).to.equal(0)
      expect(await farm.totalRewardDebt()).to.equal(0)
      expect(await farm.pendingCRP(0, await PrederA.getAddress())).to.equal(0)
    })

    it("should update pool", async () => {
      const poolAfter = await farm.poolInfo(0)
      expect(poolAfter.lastRewardBlock).to.gt(poolBefore.lastRewardBlock)
      expect(poolAfter.accCRPPerShare).to.equal(poolBefore.accCRPPerShare)
    })
  
    it("should update user pending Pred when wallet increases balance", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      await farm.updatePool(0)
      const user = await farm.userInfo(0, await PrederA.getAddress())
      const pool = await farm.poolInfo(0)
      const pending = (multiplier*predPerBlock).toString();
      expect(await farm.pendingCRP(0, await PrederA.getAddress()))
        .to.equal(
          user.amount.mul(pool.accCRPPerShare).div((BigNumber.from(10).pow(30))).sub(user.rewardDebt)
        )
    })

    it("it should withdraw user rewards with withdraw function", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      const pending: BigNumber = await farm.pendingCRP(0, await PrederA.getAddress());
      let user = await farm.userInfo(0, await PrederA.getAddress())

      await expect(() => farm.withdraw(0, 0))
        .to.changeTokenBalances(
          crp, [wallet, PrederA], [BigNumber.from(0).sub(pending.add(pending)), pending.add(pending)]
      )

      user = await farm.userInfo(0, await PrederA.getAddress())
      expect(user.amount).to.equal(depositA)
      expect(user.rewardDebt).to.equal(pending.mul(2))
      expect(await farm.pendingCRP(0, await PrederA.getAddress())).to.equal(0);
      expect(await farm.totalRewardDebt()).to.equal(0)
    })

    it("it should withdraw user rewards with deposit function", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      const pending: BigNumber = await farm.pendingCRP(0, await PrederA.getAddress());

      await expect(() => farm.deposit(0, 0))
        .to.changeTokenBalances(
          crp, [wallet, PrederA], [BigNumber.from(0).sub(pending.mul(2)), pending.mul(2)]
      )

      const user = await farm.userInfo(0, await PrederA.getAddress())
      //await farm.deposit(0, 0)

      expect(user.amount).to.equal(depositA)
      expect(user.rewardDebt).to.equal(pending.mul(2))
      
      expect(await farm.totalRewardDebt()).to.equal(0)
    })

    it("it should withdraw user balance and rewards", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      const pending: BigNumber = await farm.pendingCRP(0, await PrederA.getAddress());

      await expect(() => farm.withdraw(0, depositA)).to.changeTokenBalances(
          crp, [wallet, PrederA], [BigNumber.from(0).sub(pending.mul(2)), pending.mul(2).add(depositA)]
        );
      
      let user = await farm.userInfo(0, await PrederA.getAddress())
      expect(user.amount, "Total amount not withdrawn").to.equal(0)
      expect(user.rewardDebt, "Reward debt not removed").to.equal(0)
      expect(await farm.totalRewardDebt(), "TotalRewardDebt not reduced properly").to.equal(0)
    })
  })

  context("when user deposits when wallet is not empty", async () => {
    beforeEach(async () => {
      await prediction.startRound(tokens, startPrices);

      await prediction.predictBull(1, BTC!);
      await passInterval(network, prediction);
      await prediction.endRound(tokens, endPrices);
      //start a new round to increase current epoch
      await prediction.startRound(tokens, startPrices);
  
      await farm.add(1);
      await crp.approve(await farm.address, 100000000)
      await farm.updateMultiplier(multiplier)
      poolBefore = await farm.poolInfo(0)
      await crp.transfer(wallet.address, (10**17).toString());
      await farm.deposit(0, depositA)
    })

    it("should update user info", async () => {
      const userInfo = await farm.userInfo(0, await PrederA.getAddress())
      const pending = await farm.pendingCRP(0, await PrederA.getAddress());
      expect(userInfo.amount).to.equal(depositA)
      expect(userInfo.rewardDebt).to.equal(0)
      expect(await farm.totalRewardDebt()).to.equal(pending)
      expect(await farm.pendingCRP(0, await PrederA.getAddress())).to.equal(pending);
    })

    it("should update pool", async () => {
      await farm.updatePool(0)
      const poolAfter = await farm.poolInfo(0)

      expect(poolAfter.lastRewardBlock).to.gt(poolBefore.lastRewardBlock)
      expect(poolAfter.accCRPPerShare).to.equal(
        poolBefore.accCRPPerShare.add(
          BigNumber.from(multiplier)
          .mul(predPerBlock)
          .mul((BigNumber.from(10).pow(30)).toString())
          .div(await crp.balanceOf(farm.address))
        )
      )
    })
    // expect(await farm.totalRewardDebt()).to.equal(
    //   BigNumber.from(multiplier)
    //   .mul(predPerBlock)
    // )
  })

  context("when contract is paused", () => {
    beforeEach( async () => {
      await prediction.startRound(tokens, startPrices);
      await prediction.predictBull(1, BTC!);
      await passInterval(network, prediction);
      await prediction.endRound(tokens, endPrices);
      //start a new round to increase current epoch
      await prediction.startRound(tokens, startPrices);
  
      await farm.add(1);
      await crp.approve(await farm.address, 100000000)
      await farm.updateMultiplier(multiplier)
      await crp.transfer(wallet.address, (10**17).toString());
      await farm.deposit(0, 1000)
      await farm.pause()
    })

    it("should allow Owner unpause contract", async () => {
      await farm.unpause()
      expect(await farm.paused()).to.equal(false)
    })

    it("should allow only Owner pause and unpause contract", async () => {
      await expect(farm.pause({from: await PrederB.getAddress()})).to.be.reverted
      await expect(farm.unpause({from: await PrederB.getAddress()})).to.be.reverted
    })

    it("should not allow user to deposit and withdraw funds", async () => {
      await expect(farm.deposit(0, 1000)).to.be.reverted
      await expect(farm.withdraw(0, 1000)).to.be.reverted
    })

    it("should withdraw funds and forfeit rewards with Emergency withdraw", async () => {
      const oldWalletBalance = await crp.balanceOf(wallet.address)
      await farm.emergencyWithdraw(0);
      const user = await farm.userInfo(0, await PrederA.getAddress())
      
      expect(await crp.balanceOf(wallet.address)).to.equal(oldWalletBalance)
      expect(await farm.totalRewardDebt()).to.equal(0)
      expect(user.amount).to.equal(0)
      expect(user.rewardDebt).to.equal(0)
    })
  })

  // context("Contract Upgrade Tests", async () => {
  //   it("should upgrade contract", async () => {
  //     const provider = ethers.getDefaultProvider()
  //     const oldImplementation = await provider.getStorageAt(wallet.address, 0);
  //     farm = await upgrades.upgradeProxy(farm.address, Farm);
  //     const newImplementation = await provider.getStorageAt(wallet.address, 0);

  //     expect(newImplementation).to.not.equal(oldImplementation)
  //     expect(await farm.pred()).to.equal(crp.address)
  //     expect(await farm.predPerBlock()).to.equal(predPerBlock)
  //     expect(await farm.startBlock()).to.equal(0)
  //     expect(await farm.totalAllocPoint()).to.equal(200)
  //     expect(await farm.poolLength()).to.equal(1)
  //   })

  // })
})