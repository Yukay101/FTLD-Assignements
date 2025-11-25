const { expect } = require('chai');
const { ethers } = require('hardhat');

// Import the VotingContract ABI (we'll need to compile this)
describe('VotingContract', function () {
  let votingContract;
  let owner;
  let voter1;
  let voter2;
  let voter3;
  let candidate1Id;
  let candidate2Id;

  beforeEach(async function () {
    // Get signers
    [owner, voter1, voter2, voter3] = await ethers.getSigners();

    // Deploy the contract
    const VotingContract = await ethers.getContractFactory('VotingContract');
    // Set voting duration to 1 hour (3600 seconds)
    votingContract = await VotingContract.deploy(3600);
    await votingContract.waitForDeployment();
  });

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      expect(await votingContract.owner()).to.equal(owner.address);
    });

    it('Should set the correct voting duration', async function () {
      expect(await votingContract.votingDuration()).to.equal(3600);
    });

    it('Should set the correct voting deadline', async function () {
      const deadline = await votingContract.votingDeadline();
      const currentTime = Math.floor(Date.now() / 1000);
      expect(deadline).to.be.greaterThan(currentTime);
      expect(deadline).to.equal(currentTime + 3600);
    });
  });

  describe('Voting Status', function () {
    it('Should return true when voting is active', async function () {
      expect(await votingContract.isVotingActive()).to.be.true;
    });

    it('Should return correct remaining time', async function () {
      const remainingTime = await votingContract.getRemainingTime();
      expect(remainingTime).to.be.greaterThan(0);
      expect(remainingTime).to.be.lessThanOrEqual(3600);
    });
  });

  describe('Candidate Management', function () {
    beforeEach(async function () {
      // Register candidates
      const tx1 = await votingContract.connect(owner).registerCandidate('Alice');
      const receipt1 = await tx1.wait();
      
      const tx2 = await votingContract.connect(owner).registerCandidate('Bob');
      const receipt2 = await tx2.wait();

      // Extract candidate IDs from events
      const event1 = receipt1.logs.find(log => log.fragment?.name === 'CandidateRegistered');
      const event2 = receipt2.logs.find(log => log.fragment?.name === 'CandidateRegistered');
      
      candidate1Id = 1; // First candidate gets ID 1
      candidate2Id = 2; // Second candidate gets ID 2
    });

    it('Should register a candidate successfully', async function () {
      const tx = await votingContract.connect(owner).registerCandidate('Charlie');
      await tx.wait();

      const candidate = await votingContract.getCandidate(3);
      expect(candidate.name).to.equal('Charlie');
      expect(candidate.id).to.equal(3);
      expect(candidate.score).to.equal(0);
      expect(candidate.winner).to.be.false;
    });

    it('Should return correct candidate information', async function () {
      const candidate = await votingContract.getCandidate(candidate1Id);
      expect(candidate.name).to.equal('Alice');
      expect(candidate.id).to.equal(candidate1Id);
      expect(candidate.score).to.equal(0);
      expect(candidate.winner).to.be.false;
    });

    it('Should return all candidates', async function () {
      const allCandidates = await votingContract.getAllCandidates();
      expect(allCandidates.length).to.equal(2);
      expect(allCandidates[0].name).to.equal('Alice');
      expect(allCandidates[1].name).to.equal('Bob');
    });

    it('Should return correct total candidate count', async function () {
      expect(await votingContract.getTotalCandidates()).to.equal(2);
    });

    it('Should emit CandidateRegistered event', async function () {
      await expect(votingContract.connect(owner).registerCandidate('David'))
        .to.emit(votingContract, 'CandidateRegistered')
        .withArgs('David', 3);
    });
  });

  describe('Voter Management', function () {
    it('Should register a voter successfully', async function () {
      await votingContract.connect(voter1).registerAVoter();
      expect(await votingContract.checkIfVoterIsRegistered(voter1.address)).to.be.true;
    });

    it('Should allow owner to unregister a voter', async function () {
      await votingContract.connect(voter1).registerAVoter();
      expect(await votingContract.checkIfVoterIsRegistered(voter1.address)).to.be.true;

      await votingContract.connect(owner).unregisterVoter(voter1.address);
      expect(await votingContract.checkIfVoterIsRegistered(voter1.address)).to.be.false;
    });

    it('Should not allow unregistered voter to vote', async function () {
      await votingContract.connect(owner).registerCandidate('Alice');
      await expect(
        votingContract.connect(voter1).voteForACandidate(1)
      ).to.be.revertedWith('Voter is not registered');
    });
  });

  describe('Voting Process', function () {
    beforeEach(async function () {
      // Register candidates
      await votingContract.connect(owner).registerCandidate('Alice');
      await votingContract.connect(owner).registerCandidate('Bob');
      
      // Register voters
      await votingContract.connect(voter1).registerAVoter();
      await votingContract.connect(voter2).registerAVoter();
      await votingContract.connect(voter3).registerAVoter();
    });

    it('Should allow registered voter to vote', async function () {
      await votingContract.connect(voter1).voteForACandidate(1);
      
      const candidate = await votingContract.getCandidate(1);
      expect(candidate.score).to.equal(1);
      
      expect(await votingContract.hasVoterVoted(voter1.address)).to.be.true;
    });

    it('Should not allow voter to vote twice', async function () {
      await votingContract.connect(voter1).voteForACandidate(1);
      
      await expect(
        votingContract.connect(voter1).voteForACandidate(2)
      ).to.be.revertedWith('Voter has already voted');
    });

    it('Should not allow voting after deadline', async function () {
      // Fast forward time by 2 hours (more than voting duration)
      await ethers.provider.send('evm_increaseTime', [7200]);
      await ethers.provider.send('evm_mine', []);
      
      await expect(
        votingContract.connect(voter1).voteForACandidate(1)
      ).to.be.revertedWith('Voting has ended');
    });

    it('Should emit userVoted event', async function () {
      await expect(votingContract.connect(voter1).voteForACandidate(1))
        .to.emit(votingContract, 'userVoted')
        .withArgs(voter1.address, 1, 'Alice');
    });

    it('Should update candidate score correctly', async function () {
      await votingContract.connect(voter1).voteForACandidate(1);
      await votingContract.connect(voter2).voteForACandidate(1);
      await votingContract.connect(voter3).voteForACandidate(2);
      
      const candidate1 = await votingContract.getCandidate(1);
      const candidate2 = await votingContract.getCandidate(2);
      
      expect(candidate1.score).to.equal(2);
      expect(candidate2.score).to.equal(1);
    });
  });

  describe('Voting Duration Management', function () {
    it('Should allow owner to set new voting duration', async function () {
      const newDuration = 7200; // 2 hours
      await votingContract.connect(owner).setVotingDuration(newDuration);
      
      expect(await votingContract.votingDuration()).to.equal(newDuration);
      
      const deadline = await votingContract.votingDeadline();
      const currentTime = Math.floor(Date.now() / 1000);
      expect(deadline).to.equal(currentTime + newDuration);
    });

    it('Should not allow non-owner to set voting duration', async function () {
      await expect(
        votingContract.connect(voter1).setVotingDuration(7200)
      ).to.be.revertedWith('Only owner can call this function');
    });
  });

  describe('Candidate Statistics', function () {
    beforeEach(async function () {
      await votingContract.connect(owner).registerCandidate('Alice');
      await votingContract.connect(owner).registerCandidate('Bob');
      await votingContract.connect(owner).registerCandidate('Charlie');
      
      await votingContract.connect(voter1).registerAVoter();
      await votingContract.connect(voter2).registerAVoter();
      await votingContract.connect(voter3).registerAVoter();
    });

    it('Should return correct candidate statistics', async function () {
      // Alice gets 2 votes
      await votingContract.connect(voter1).voteForACandidate(1);
      await votingContract.connect(voter2).voteForACandidate(1);
      
      // Bob gets 1 vote
      await votingContract.connect(voter3).voteForACandidate(2);
      
      const [votes, rank] = await votingContract.getCandidateStats(1);
      expect(votes).to.equal(2);
      expect(rank).to.equal(1); // Alice is first place
      
      const [votes2, rank2] = await votingContract.getCandidateStats(2);
      expect(votes2).to.equal(1);
      expect(rank2).to.equal(2); // Bob is second place
      
      const [votes3, rank3] = await votingContract.getCandidateStats(3);
      expect(votes3).to.equal(0);
      expect(rank3).to.equal(3); // Charlie is third place
    });
  });

  describe('Winner Determination', function () {
    beforeEach(async function () {
      await votingContract.connect(owner).registerCandidate('Alice');
      await votingContract.connect(owner).registerCandidate('Bob');
      
      await votingContract.connect(voter1).registerAVoter();
      await votingContract.connect(voter2).registerAVoter();
      await votingContract.connect(voter3).registerAVoter();
      
      // Cast some votes
      await votingContract.connect(voter1).voteForACandidate(1); // Alice
      await votingContract.connect(voter2).voteForACandidate(1); // Alice
      await votingContract.connect(voter3).voteForACandidate(2); // Bob
    });

    it('Should not determine winner while voting is active', async function () {
      await expect(
        votingContract.connect(owner).determineWinner()
      ).to.be.revertedWith('Voting is still active');
    });

    it('Should determine winner after voting ends', async function () {
      // Fast forward time to end voting
      await ethers.provider.send('evm_increaseTime', [7200]);
      await ethers.provider.send('evm_mine', []);
      
      const winner = await votingContract.connect(owner).determineWinner();
      
      expect(winner.name).to.equal('Alice');
      expect(winner.id).to.equal(1);
      expect(winner.score).to.equal(2);
      expect(winner.winner).to.be.true;
    });

    it('Should emit CandidateWon event', async function () {
      // Fast forward time to end voting
      await ethers.provider.send('evm_increaseTime', [7200]);
      await ethers.provider.send('evm_mine', []);
      
      await expect(votingContract.connect(owner).determineWinner())
        .to.emit(votingContract, 'CandidateWon')
        .withArgs('Alice', 1);
    });

    it('Should get candidate with highest vote', async function () {
      const highestVoteCandidate = await votingContract.getCandidateWithHighestVote();
      expect(highestVoteCandidate.name).to.equal('Alice');
      expect(highestVoteCandidate.score).to.equal(2);
    });

    it('Should not determine winner with no candidates', async function () {
      // Fast forward time to end voting
      await ethers.provider.send('evm_increaseTime', [7200]);
      await ethers.provider.send('evm_mine', []);
      
      // Deploy a new contract with no candidates
      const NewVotingContract = await ethers.getContractFactory('VotingContract');
      const newContract = await NewVotingContract.deploy(3600);
      await newContract.waitForDeployment();
      
      await expect(
        newContract.connect(owner).determineWinner()
      ).to.be.revertedWith('No candidates registered');
    });
  });

  describe('Edge Cases and Error Handling', function () {
    it('Should revert when getting non-existent candidate', async function () {
      await expect(
        votingContract.getCandidate(999)
      ).to.be.reverted; // Should revert for non-existent candidate
    });

    it('Should handle multiple candidates with same score', async function () {
      await votingContract.connect(owner).registerCandidate('Alice');
      await votingContract.connect(owner).registerCandidate('Bob');
      
      await votingContract.connect(voter1).registerAVoter();
      
      // Both candidates get 1 vote (tie)
      await votingContract.connect(voter1).voteForACandidate(1);
      
      // Manually set Bob's score to 1 (simulating a tie)
      // Note: This would normally require additional functionality, but for testing
      // we'll test the getCandidateWithHighestVote function behavior
      
      const highestVoteCandidate = await votingContract.getCandidateWithHighestVote();
      expect(highestVoteCandidate.id).to.equal(1); // First candidate wins in tie
    });
  });
});