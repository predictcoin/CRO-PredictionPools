import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { Signer, Contract, BigNumber as _BigNumber, BigNumber, ContractFactory } from "ethers";
import { 
  LoserPredictionPool, LoserPredictionPool__factory, 
  Prediction, Prediction__factory, 
  PredictionWallet, PredictionWallet__factory,
  CRP, CRP__factory,
  MFF, MFF__factory
} from "../src/types";


let signers: Signer[], 
  pool: LoserPredictionPool, 
  PrederA: Signer, 
  crp: CRP,
  PrederB: Signer,
  mff: MFF,
  Pool: LoserPredictionPool__factory,
  wallet: PredictionWallet,
  prediction: Prediction,
  PredictionFactory: Prediction__factory,
  Wallet: PredictionWallet__factory;
const rewardTokenPerBlock = 50000000000;
let walletContract: Contract;

type Pool = { 
  allocPoint: _BigNumber, 
  lastRewardBlock: _BigNumber, 
  accRewardTokenPerShare: _BigNumber
};

let poolBefore: Pool;
const {BTC,ETH,CRO, DOGE, LTC} = process.env;
const tokens = [BTC, ETH, LTC, CRO, DOGE] as string[];
const startPrices = [3000000, 300000, 14000, 400, 200];
const endPrices = [3000001, 200000, 13000, 100, 900];
let [depositA, depositB] = [8883, 9248]
const multiplier = 10000000

async function passInterval(_network: typeof network, prediction:Contract){
  await _network.provider.send("evm_increaseTime", 
    [86500]
  );
  await _network.provider.send("evm_mine");
}

describe("Prediction Pool Contract Tests", () => {

  beforeEach( async () => {
    signers = await ethers.getSigners();
    [PrederA, PrederB] = signers

    const CRPFactory: CRP__factory = (await ethers.getContractFactory("CRP")) as CRP__factory
    crp = await CRPFactory.deploy();

    const MFFFactory: MFF__factory = (await ethers.getContractFactory("MFF")) as MFF__factory
    mff = await MFFFactory.deploy();

    PredictionFactory = (await ethers.getContractFactory("Prediction")) as Prediction__factory;

    prediction = (await upgrades.deployProxy(
      PredictionFactory,
      [
        crp.address,
        await PrederA.getAddress(),
        await PrederA.getAddress(),
        86400,
        300,
        40000,
        ethers.utils.parseUnits("10"),
        10,
      ],
      { kind: "uups" }
    )) as Prediction;

    await prediction.addTokens(tokens);
    
    
    // approve prediction contract to spend crp tokens
    await crp.approve(prediction.address, ethers.utils.parseEther("50"));
    Wallet = (await ethers.getContractFactory("PredictionWallet")) as PredictionWallet__factory
    wallet = await Wallet.deploy(crp.address);

    Pool = (await ethers.getContractFactory("LoserPredictionPool")) as LoserPredictionPool__factory;
    
    pool = (await upgrades.deployProxy(
      Pool, [
      await PrederA.getAddress(),
      crp.address, 
      mff.address,
      rewardTokenPerBlock, 0, 
      ethers.utils.parseEther("100"), 
      wallet.address, 
      prediction.address
    ], 
      {kind: "uups"}
    )) as LoserPredictionPool;

    await wallet.grantRole(
      ethers.utils.formatBytes32String("loserPredictionPool"), 
      pool.address
    );
  })

  it("should initialise contract state variables", async () => {
    expect(await pool.CRP()).to.equal(crp.address);
    expect(await pool.rewardTokenPerBlock()).to.equal(rewardTokenPerBlock);
    expect(await pool.startBlock()).to.equal(0);
  })

  it("should update multiplier", async () => {
    await pool.updateMultiplier(multiplier)
    expect(await pool.BONUS_MULTIPLIER()).to.equal(multiplier)
  })

  it("should allow only owner add a new pool", async () => {
    await expect(pool.add(0, {from: await PrederB.getAddress()})).to.be.reverted;
  })

  it("should start a new pool", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    //start a new round to increase current epoch
    await prediction.startRound(tokens, startPrices);

    await pool.add(1);
    const newPool = await pool.poolInfo(0)
    expect(newPool.allocPoint.toString()).to.equal("200");
    expect(newPool.epoch).to.equal((await prediction.currentEpoch()).sub("1"));
    expect(newPool.accRewardTokenPerShare.toString()).to.equal("0")
  })

  it("should start another pool", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);
    
    //start a new round to increase current epoch
    await prediction.startRound(tokens, startPrices);
    

    await pool.add(1);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    await pool.add(2);
    const pool1 = await pool.poolInfo(0)
    expect(pool1.allocPoint.toString()).to.equal("0");

    const pool2 = await pool.poolInfo(1);
    expect(pool2.allocPoint.toString()).to.equal("200");
    expect(pool2.epoch).to.equal(await prediction.currentEpoch());
  })

  it("should set pool allocation point", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    await pool.add(1);
    await pool.setAllocPoint(10000000);
    const newPool = await pool.poolInfo(0);
    expect(newPool.allocPoint).to.equal(200);
    expect(await pool.allocPoint()).to.equal(10000000);
  })

  it("should set pool allocation point", async () => {
    await prediction.startRound(tokens, startPrices);
    await passInterval(network, prediction);
    await prediction.endRound(tokens, endPrices);

    await pool.add(1);
    await pool.setPoolAllocPoint(10000000);
    const newPool = await pool.poolInfo(0);
    expect(newPool.allocPoint).to.equal(10000000);
  })

  it("should return multiplier across blocks", async () => {
    const bonus_multiplier = await pool.BONUS_MULTIPLIER()
    expect(await pool.getMultiplier(110, 200)).to.be.equal(bonus_multiplier.mul(200-110))
  })

  context("when user deposits when wallet is empty", async () => {
    beforeEach(async () => {
      await prediction.startRound(tokens, startPrices);
      await prediction.predictBull(1, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
      await passInterval(network, prediction);
      await prediction.endRound(tokens, endPrices);
  
      await pool.add(1);
      await crp.approve(await pool.address, 100000000)
      await pool.updateMultiplier(multiplier)
      poolBefore = await pool.poolInfo(0)
      depositA = 1000;
      await pool.deposit(0, depositA)
    })

    it("should update user info", async () => {
      const userInfo = await pool.userInfo(0, await PrederA.getAddress())
      expect(userInfo.amount).to.equal(depositA)
      expect(userInfo.rewardDebt).to.equal(0)
      expect(await pool.totalRewardDebt()).to.equal(0)
      expect(await pool.pendingRewardToken(0, await PrederA.getAddress())).to.equal(0)
    })

    it("should update pool", async () => {
      const poolAfter = await pool.poolInfo(0)
      expect(poolAfter.lastRewardBlock).to.gt(poolBefore.lastRewardBlock)
      expect(poolAfter.accRewardTokenPerShare).to.equal(poolBefore.accRewardTokenPerShare)
    })
  
    it("should update user pending CRP when wallet increases balance", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      await pool.updatePool(0)
      const user = await pool.userInfo(0, await PrederA.getAddress())
      const newPool = await pool.poolInfo(0)
      const pending = (multiplier*rewardTokenPerBlock).toString();
      expect(await pool.pendingRewardToken(0, await PrederA.getAddress()))
        .to.equal(
          user.amount.mul(newPool.accRewardTokenPerShare).div((BigNumber.from(10).pow(30))).sub(user.rewardDebt)
        )
    })

    it("it should withdraw user rewards with withdraw function", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      const pending: BigNumber = await pool.pendingRewardToken(0, await PrederA.getAddress());
      let user = await pool.userInfo(0, await PrederA.getAddress())

      await expect(() => pool.withdraw(0, 0))
        .to.changeTokenBalances(
          crp, [wallet, PrederA], [BigNumber.from(0).sub(pending.add(pending)), pending.add(pending)]
      )

      user = await pool.userInfo(0, await PrederA.getAddress())
      expect(user.amount).to.equal(depositA)
      expect(user.rewardDebt).to.equal(pending.mul(2))
      expect(await pool.pendingRewardToken(0, await PrederA.getAddress())).to.equal(0);
      expect(await pool.totalRewardDebt()).to.equal(0)
    })

    it("it should withdraw user rewards with deposit function", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      const pending: BigNumber = await pool.pendingRewardToken(0, await PrederA.getAddress());

      await expect(() => pool.deposit(0, 0))
        .to.changeTokenBalances(
          crp, [wallet, PrederA], [BigNumber.from(0).sub(pending.mul(2)), pending.mul(2)]
      )

      const user = await pool.userInfo(0, await PrederA.getAddress())
      //await pool.deposit(0, 0)

      expect(user.amount).to.equal(depositA)
      expect(user.rewardDebt).to.equal(pending.mul(2))
      
      expect(await pool.totalRewardDebt()).to.equal(0)
    })

    it("it should withdraw user balance and rewards", async () => {
      await crp.transfer(wallet.address, (10**17).toString());
      const pending: BigNumber = await pool.pendingRewardToken(0, await PrederA.getAddress());
      let user = await pool.userInfo(0, await PrederA.getAddress())
      await pool.withdraw(0, depositA)
      user = await pool.userInfo(0, await PrederA.getAddress())

      await expect(() => pool.withdraw(0, depositA))
        .to.changeTokenBalances(
          crp, [walletContract, PrederA], [BigNumber.from(0).sub(pending.mul(2)), pending.mul(2)]
        )

      expect(user.amount, "Total amount not withdrawn").to.equal(0)
      expect(user.rewardDebt, "Reward debt not removed").to.equal(0)
      expect(await pool.totalRewardDebt(), "TotalRewardDebt not reduced properly").to.equal(0)
    })
  })

  context("when user deposits when wallet is not empty", async () => {
    beforeEach(async () => {
      await prediction.startRound(tokens, startPrices);
      await prediction.predictBull(1, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
      await passInterval(network, prediction);
      await prediction.endRound(tokens, endPrices);
  
      await pool.add(1);
      await crp.approve(await pool.address, 100000000)
      await pool.updateMultiplier(multiplier)
      poolBefore = await pool.poolInfo(0)
      await PrederA.sendTransaction({to: wallet.address, value: BigNumber.from((10**17).toString())});
      await pool.deposit(0, depositA);
    })

    it("should update user info", async () => {
      const userInfo = await pool.userInfo(0, await PrederA.getAddress())
      
      await passInterval(network, prediction);
      await passInterval(network, prediction);
      await pool.updatePool(0);
      const pending = await pool.pendingRewardToken(0, await PrederA.getAddress());
      console.log(pending);
      expect(userInfo.amount).to.equal(depositA);
      expect(userInfo.rewardDebt).to.equal(0);
      expect(await pool.totalRewardDebt()).to.equal(pending);
      //expect(await pool.pendingRewardToken(0, await PrederA.getAddress())).to.equal(pending);
    })

    it("should update pool", async () => {
      await pool.updatePool(0)
      const poolAfter = await pool.poolInfo(0)

      expect(poolAfter.lastRewardBlock).to.gt(poolBefore.lastRewardBlock)
      expect(poolAfter.accRewardTokenPerShare).to.equal(
        poolBefore.accRewardTokenPerShare.add(
          BigNumber.from(multiplier)
          .mul(rewardTokenPerBlock)
          .mul((BigNumber.from(10).pow(30)).toString())
          .div(await crp.balanceOf(pool.address))
        )
      )
    })
    // expect(await pool.totalRewardDebt()).to.equal(
    //   BigNumber.from(multiplier)
    //   .mul(rewardTokenPerBlock)
    // )
  })

  context("when contract is paused", () => {
    beforeEach( async () => {
      await prediction.startRound(tokens, startPrices);
      await prediction.predictBull(1, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
      await passInterval(network, prediction);
      await prediction.endRound(tokens, endPrices);
  
      await pool.add(1);
      await crp.approve(await pool.address, 100000000)
      await pool.updateMultiplier(multiplier)
      await crp.transfer(wallet.address, (10**17).toString());
      await pool.deposit(0, 1000)
      await pool.pause()
    })

    it("should allow Owner unpause contract", async () => {
      await pool.unpause()
      expect(await pool.paused()).to.equal(false)
    })

    it("should allow only Owner pause and unpause contract", async () => {
      await expect(pool.pause({from: await PrederB.getAddress()})).to.be.reverted;
      await expect(pool.unpause({from: await PrederB.getAddress()})).to.be.reverted;
    })

    it("should not allow user to deposit and withdraw funds", async () => {
      await expect(pool.deposit(0, 1000)).to.be.reverted;
      await expect(pool.withdraw(0, 1000)).to.be.reverted;
    })

    it("should withdraw funds and forfeit rewards with Emergency withdraw", async () => {
      const oldWalletBalance = await crp.balanceOf(wallet.address)
      await pool.emergencyWithdraw(0);
      const user = await pool.userInfo(0, await PrederA.getAddress())
      
      expect(await crp.balanceOf(wallet.address)).to.equal(oldWalletBalance)
      expect(await pool.totalRewardDebt()).to.equal(0)
      expect(user.amount).to.equal(0)
      expect(user.rewardDebt).to.equal(0)
    })
  })

  // context("Contract Upgrade Tests", async () => {
  //   it("should upgrade contract", async () => {
  //     const provider = ethers.getDefaultProvider()
  //     const oldImplementation = await provider.getStorageAt(wallet.address, 0);
  //     pool = await upgrades.upgradeProxy(pool.address, Pool);
  //     const newImplementation = await provider.getStorageAt(wallet.address, 0);

  //     expect(newImplementation).to.not.equal(oldImplementation)
  //     expect(await pool.pred()).to.equal(crp.address)
  //     expect(await pool.rewardTokenPerBlock()).to.equal(rewardTokenPerBlock)
  //     expect(await pool.startBlock()).to.equal(0)
  //     expect(await pool.totalAllocPoint()).to.equal(200)
  //     expect(await pool.poolLength()).to.equal(1)
  //   })

  // })
})