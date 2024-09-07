const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")


developmentChains.includes(network.name)
?describe.skip:
describe("Raffle unit tests", function () {
    let raffle,raffleEntranceFee
    
    let deployer
    beforeEach(async function () {
        deployer=(await getNamedAccounts()).deployer
        raffle=await ethers.getContract("Raffle",deployer)
        raffleEntranceFee=await raffle.getEntranceFee()
    })

    describe("fulfillRandomWords", function () {
        it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
            // enter the raffle
            console.log("Setting up test...")
            const startingTimeStamp = await raffle.getLastTimeStamp()
            const accounts = await ethers.getSigners()

            console.log("Setting up Listener...")
            await new Promise(async (resolve, reject) => {
                // setup listener before we enter the raffle
                // Just in case the blockchain moves REALLY fast
                raffle.once("WinnerPicked", async () => {
                    console.log("WinnerPicked event fired!")
                    try {
                        // add our asserts here
                        const recentWinner = await raffle.getRecentWinner()
                        const raffleState = await raffle.getRaffleState()
                        const winnerEndingBalance = await raffle.runner.provider.getBalance(
                            accounts[0]
                        )
                        const endingTimeStamp = await raffle.getLastTimeStamp()

                        await expect(raffle.getPlayer(0)).to.be.reverted
                        assert.equal(recentWinner.toString(), accounts[0].address)
                        assert.equal(raffleState, 0)
                        assert.equal(
                            winnerEndingBalance.toString(),
                            (winnerStartingBalance+raffleEntranceFee).toString()
                        )
                        assert(endingTimeStamp > startingTimeStamp)
                        resolve()
                    } catch (error) {
                        console.log(error)
                        reject(error)
                    }
                })
                // Then entering the raffle
                console.log("Entering Raffle...")
                const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                await tx.wait(6)
                console.log("Ok, time to wait...")
                const winnerStartingBalance = await raffle.runner.provider.getBalance(
                    accounts[0]
                  )

                // and this code WONT complete until our listener has finished listening!
            })
        }).timeout(100000000)
    })

})