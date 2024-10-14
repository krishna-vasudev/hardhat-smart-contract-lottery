const { network,ethers } = require("hardhat")
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const FUND_AMOUNT = ethers.parseEther("50")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    // const signer = await ethers.getSigner(deployer);
    const chainId = network.config.chainId

    let VRFCoordinatorV2_5Address,subscriptionId
    if (developmentChains.includes(network.name)) {
        const VRFCoordinatorV2_5 = await ethers.getContract("VRFCoordinatorV2_5Mock")
        VRFCoordinatorV2_5Address = VRFCoordinatorV2_5.target
        // const VRFCoordinatorV2_5Deplomewnt = await deployments.get("VRFCoordinatorV2_5Mock")
        // VRFCoordinatorV2_5Address = VRFCoordinatorV2_5Deplomewnt.address
        // const VRFCoordinatorV2_5=await ethers.getContractAt("VRFCoordinatorV2_5Mock",VRFCoordinatorV2_5Address,signer)
        const transactionResponse = await VRFCoordinatorV2_5.createSubscription()
        const transactionReceipt = await transactionResponse.wait()
        subscriptionId = transactionReceipt.logs[0].args.subId
        // Fund the subscription
        // Our mock makes it so we don't actually have to worry about sending fund
        await VRFCoordinatorV2_5.fundSubscription(subscriptionId, FUND_AMOUNT)
        console.log("subscriptionId:"+subscriptionId)
    } else {
        VRFCoordinatorV2_5Address = networkConfig[chainId]["vrfCoordinatorV2_5"]
        subscriptionId=networkConfig[chainId]["subscriptionId"]
    }
    const args=[
        VRFCoordinatorV2_5Address,
        subscriptionId,
        networkConfig[chainId]["gasLane"],
        networkConfig[chainId]["raffleEntranceFee"],
        networkConfig[chainId]["callbackGasLimit"],
        networkConfig[chainId]["keepersUpdateInterval"],
    ]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2_5Mock = await ethers.getContract("VRFCoordinatorV2_5Mock")
        await vrfCoordinatorV2_5Mock.addConsumer(subscriptionId, raffle.address)
    }


    if (
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        await verify(raffle.address, args)
    }

    console.log("-----------------------------------------------------------------------")

}

module.exports.tags=["all","raffle"]