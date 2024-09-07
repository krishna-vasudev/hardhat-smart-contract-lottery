// const { network } = require("hardhat")
const {developmentChains}=require("../helper-hardhat-config")
const BASEFEE="100000000000000000"
const GASPRICELINK="1000000000"
const WEIPERUNITLINK="4382690704854711"
module.exports = async ({ getNamedAccounts, deployments,network }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const networkName = network.name
    const args=[BASEFEE,GASPRICELINK,WEIPERUNITLINK]
    // If we are on a local development network, we need to deploy mocks!
    if (developmentChains.includes(networkName)) {
        log("Local network detected! Deploying mocks...")
        await deploy("VRFCoordinatorV2_5Mock", {
            from: deployer,
            log: true,
            args: args,
        })
        log("Mocks Deployed!")
        log("------------------------------------------------")
        log(
            "You are deploying to a local network, you'll need a local network running to interact"
        )
        log(
            "Please run `npx hardhat console` to interact with the deployed smart contracts!"
        )
        log("------------------------------------------------")
    }
}
module.exports.tags = ["all", "mocks"]