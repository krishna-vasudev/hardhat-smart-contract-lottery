const { ethers, network } = require("hardhat")
// subscriptionId:71488757988438446264442112164507101228896791040736990024874002830625193879838
async function mockKeepers() {
    const raffle = await ethers.getContract("Raffle")
    const checkData = ethers.keccak256(ethers.toUtf8Bytes(""))
    const { upkeepNeeded } = await raffle.checkUpkeep.staticCall(checkData)
    if (upkeepNeeded) {
        const tx = await raffle.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        const requestId = txReceipt.logs[1].args.requestId
        console.log(`Performed upkeep with RequestId: ${requestId}`)
        if (network.config.chainId == 31337) {
            await mockVrf(requestId, raffle)
        }
    } else {
        console.log("No upkeep needed!")
    }
}

async function mockVrf(requestId, raffle) {
    console.log("We on a local network? Ok let's pretend...")
    const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2_5Mock")
    // const subscriptionId="51494394496092327661188027011873802218211344963556847157103595035422000982782"
    // await VRFCoordinatorV2_5.fundSubscription(subscriptionId, FUND_AMOUNT)
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.target)
    console.log("Responded!")
    const recentWinner = await raffle.getRecentWinner()
    console.log(`The winner is: ${recentWinner}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })