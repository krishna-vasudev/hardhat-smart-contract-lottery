const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")


!developmentChains.includes(network.name)
?describe.skip:
describe("Raffle unit tests", function () {
    let raffle,VRFCoordinatorV2_5Mock,raffleEntranceFee,interval,raffleBalance
    const chainId=network.config.chainId
    let deployer
    beforeEach(async function () {
        deployer=(await getNamedAccounts()).deployer
        await deployments.fixture("all")
        raffle=await ethers.getContract("Raffle",deployer)
        VRFCoordinatorV2_5Mock=await ethers.getContract("VRFCoordinatorV2_5Mock",deployer)
        raffleEntranceFee=await raffle.getEntranceFee()
        interval=await raffle.getInterval()
    })

    describe("constructor", function () {
        it("should initialize the raffle correctly",async function () {
            const raffleState=await raffle.getRaffleState()
            assert.equal(raffleState.toString(),"0")
            assert.equal(interval.toString(),networkConfig[chainId]["keepersUpdateInterval"])
        })
    })

    describe("enter raffle", function(){
        it("reverts back when you don't pay enough",async function () {
            await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(raffle,"Raffle__NotEnoughEthEntered")
        })
        it("records player when they enter", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee })
            const contractPlayer = await raffle.getPlayer(0)
            assert.equal(deployer, contractPlayer)
        })
        it("emits event on enter",async function () {
            await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                raffle,
                "RaffleEnter"
            )
        })

        it("doesn't allow entrance when raffle is calculating", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee })
            // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
            await network.provider.send("evm_increaseTime", [Number(interval) + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            // we pretend to be a keeper for a second

            await raffle.performUpkeep("0x") // changes the state to calculating for our comparison below
            await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWithCustomError( 
                raffle,
                "Raffle__NotOpen"
            )
        })
    })

    describe("checkUpkeep", function () {
        it("should return false if people haven't sent any ETH", async function () {
            await network.provider.send("evm_increaseTime", [Number(interval) + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
            assert(!upkeepNeeded)
        })

        it("should return false if raffle isn't open",async function () {
            await raffle.enterRaffle({value:raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [Number(interval) + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            // we pretend to be a keeper for a second
            await raffle.performUpkeep("0x") // changes the state to calculating for our comparison below
            raffleState=await raffle.getRaffleState()
            const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
            assert.equal(raffleState.toString(),"1")
            assert.equal(upkeepNeeded,false)
        })

        it("returns false if enough time hasn't passed",async function () {
            await raffle.enterRaffle({value:raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [Number(interval) - 3])
            await network.provider.request({ method: "evm_mine", params: [] })
            raffleState=await raffle.getRaffleState()
            const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
            assert.equal(raffleState.toString(),"0")
            assert.equal(upkeepNeeded,false)
        })

        it("returns true if enough time has passed, has players, eth and is open",async function () {
            await raffle.enterRaffle({value:raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [Number(interval) +1])
            await network.provider.request({ method: "evm_mine", params: [] })
            raffleState=await raffle.getRaffleState()
            const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
            assert.equal(raffleState.toString(),"0")
            assert.equal(upkeepNeeded,true)
        })
    })

    describe("performUpkeep",function(){
        it("should work only if checkUpkeep is true",async function () {
            await raffle.enterRaffle({value:raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [Number(interval) +1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const tx=await raffle.performUpkeep("0x")
            assert(tx)
        })
        
        it("should revert if performUpkeep is false",async function () {
            await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(raffle,"Raffle__UpkeepNotNeeded")
        })

        it("updates the raffle state and emits a requestId", async () => {
            // Too many asserts in this test!
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [Number(interval) + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const txResponse = await raffle.performUpkeep("0x") // emits requestId
            const txReceipt = await txResponse.wait(1) // waits 1 block
            const raffleState = await raffle.getRaffleState() // updates state
            const requestId = txReceipt.logs[1].args.requestId
            assert(Number(requestId) > 0)
            assert(raffleState.toString() == "1") // 0 = open, 1 = calculating
        })

    })

    describe("fulfillRandomWords", function () {
        beforeEach(async () => {
            raffleBalance=await raffle.runner.provider.getBalance(
                raffle.target
            )
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [Number(interval) + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
        })
        it("can only be called after performupkeep", async () => {
            await expect(
                VRFCoordinatorV2_5Mock.fulfillRandomWords(0, raffle.target) // reverts if not fulfilled
            ).to.be.revertedWithCustomError(VRFCoordinatorV2_5Mock,"InvalidRequest")
            await expect(
                VRFCoordinatorV2_5Mock.fulfillRandomWords(1, raffle.target) // reverts if not fulfilled
            ).to.be.revertedWithCustomError(VRFCoordinatorV2_5Mock,"InvalidRequest")
        })

      // This test is too big...
      // This test simulates users entering the raffle and wraps the entire functionality of the raffle
      // inside a promise that will resolve if everything is successful.
      // An event listener for the WinnerPicked is set up
      // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
      // All the assertions are done once the WinnerPicked event is fired
        it("picks a winner, resets, and sends money", async () => {
            const additionalEntrances = 3 // to test
            const startingIndex = 1
            let startingBalance,raffleConnnectedContract
            raffleBalance=await raffle.runner.provider.getBalance(
                raffle.target
            )
            const accounts=await ethers.getSigners()
            for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) { // i = 2; i < 5; i=i+1
                raffleConnnectedContract = raffle.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                await raffleConnnectedContract.enterRaffle({ value: raffleEntranceFee })
            }
            const startingTimeStamp = await raffle.getLastTimeStamp() // stores starting timestamp (before we fire our event)

            // This will be more important for our staging tests...
            //Promise helps to wait for raflle.once listener to listen for event after calling
            // fulfillRandomWords function,because without promise the test finishes before listener listens
            //as we await for promise to resolve or reject, so it waits until that happens
            // i.e.,listener listens and promise gets resolved or if a error occurs it rejects.
            await new Promise(async (resolve, reject) => {
                raffle.once("WinnerPicked", async () => { // event listener for WinnerPicked
                    console.log("WinnerPicked event fired!")
                    // assert throws an error if it fails, so we need to wrap
                    // it in a try/catch so that the promise returns event
                    // if it fails.
                    try {
                        // Now lets get the ending values...
                        raffleBalance=await raffle.runner.provider.getBalance(
                            raffle.target
                        )
                        const recentWinner = await raffle.getRecentWinner()
                        const raffleState = await raffle.getRaffleState()
                        const winnerBalance = await raffle.runner.provider.getBalance(
                            accounts[1]
                        )
                        const endingTimeStamp = await raffle.getLastTimeStamp()
                        await expect(raffle.getPlayer(0)).to.be.reverted
                        // Comparisons to check if our ending values are correct:
                        assert.equal(recentWinner.toString(), accounts[1].address)
                        assert.equal(raffleState, 0)
                        assert.equal(
                            winnerBalance.toString(), 
                         (startingBalance +  (raffleEntranceFee * BigInt(additionalEntrances)) + raffleEntranceFee ).toString()
                        )
                        assert(endingTimeStamp > startingTimeStamp)
                        resolve() // if try passes, resolves the promise 
                    } catch (e) { 
                        reject(e) // if try fails, rejects the promise
                    }
                })

                // kicking off the event by mocking the chainlink keepers and vrf coordinator
                try {
                  const tx = await raffle.performUpkeep("0x")
                  const txReceipt = await tx.wait(1)
                //   const account_2_address=await accounts[2].getAddress()
                  startingBalance = await raffle.runner.provider.getBalance(
                    accounts[1]
                  )
                  raffleBalance=await raffle.runner.provider.getBalance(
                    raffle.target
                  )
                  await VRFCoordinatorV2_5Mock.fulfillRandomWords(
                      txReceipt.logs[1].args.requestId,
                      raffle.target
                  )

                } catch (e) {
                    reject(e)
                }
            })
        })
    })

})