// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.30;

// Vote for a candidate
// Register a candidate
// Get a candidate
// Get a candidate with the highest vote
// Register a voter
// Voter cannot vote more than once
// Set voting duration
// Availability of record



contract VotingContract {

    // Candidate object
    struct Candidate {
        uint256 id;
        string name;
        uint256 score;
        bool winner;
    }

    event CandidateRegistered(string name, uint256 id);
    event CandidateWon(string name, uint256 id);
    event userVoted(address voter, uint256 candidateID, string name);

    address public owner;
    uint256 private candidateCount = 1;
    uint256 public votingDuration;
    uint256 public votingDeadline;

    // Store candidates
    // We can use a mapping or we can use an array id: candidate
    mapping (uint256 => Candidate) public candidates;
    Candidate[] public candidateArray = [];

    // A mapping for registered voters. 0x0efo3: true -- voter is regitered
    mapping(address => bool) public registeredVoters;
    
    // A mapping to track who has already voted
    mapping(address => bool) public hasVoted;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(uint256 _votingDuration) {
        owner = msg.sender;
        votingDuration = _votingDuration;
        votingDeadline = block.timestamp + _votingDuration;
    }

    /**
     * Set new voting duration (only owner can call)
     * @param _newDuration New duration in seconds
     */
    function setVotingDuration(uint256 _newDuration) public onlyOwner {
        votingDuration = _newDuration;
        votingDeadline = block.timestamp + _newDuration;
    }

    /**
     * Check if voting is still active
     * @return true if voting is active, false otherwise
     */
    function isVotingActive() public view returns (bool) {
        return block.timestamp <= votingDeadline;
    }

    /**
     * Check remaining time for voting
     * @return remaining time in seconds
     */
    function getRemainingTime() public view returns (uint256) {
        if (block.timestamp > votingDeadline) {
            return 0;
        }
        return votingDeadline - block.timestamp;
    }

    /**
     * Register a candidate
     * @param name Name of the candidate
     * return name, id of the candidate
     */
    function registerCandidate(string memory _name) public returns (string memory, uint256) {
        Candidate memory newCandidate = Candidate(candidateCount, _name, 0, false);
        candidateArray.push(newCandidate);
        candidates[candidateCount] = newCandidate;
        // Broadcast a candidate has been registered
        emit CandidateRegistered(_name, candidateCount);
        candidateCount ++; // increase the candidate count 
    }

    function getCandidate(uint256 _id) public view returns (Candidate memory) {
        return candidates[_id];
    }

    /**
     * Determine and announce the winner
     * @return Candidate struct of the winning candidate
     */
    function determineWinner() public onlyOwner returns (Candidate memory) {
        require(candidateArray.length > 0, "No candidates registered");
        require(!isVotingActive(), "Voting is still active");
        
        Candidate memory winningCandidate = getCandidateWithHighestVote();
        
        // Mark the candidate as winner
        candidates[winningCandidate.id].winner = true;
        winningCandidate.winner = true;
        
        // Emit winner event
        emit CandidateWon(winningCandidate.name, winningCandidate.id);
        
        return winningCandidate;
    }

    /**
     * Get all candidates for off-chain processing
     * @return Array of all candidates
     */
    function getAllCandidates() public view returns (Candidate[] memory) {
        return candidateArray;
    }

    /**
     * Get total number of registered candidates
     * @return Number of candidates
     */
    function getTotalCandidates() public view returns (uint256) {
        return candidateArray.length;
    }

    /**
     * Get total number of registered voters
     * @return Number of voters (approximation)
     */
    function getTotalVoters() public view returns (uint256) {
        uint256 voterCount = 0;
        for (uint256 i = 0; i < candidateArray.length; i++) {
            // Note: This is an approximation. 
            // In production, you'd maintain a separate counter for better gas efficiency
        }
        // For now, return 0 as counting all registered voters would be expensive
        return 0;
    }
    
    function getCandidateWithHighestVote() public view returns (Candidate memory) {
        require(candidateArray.length > 0, "No candidates registered");
        
        uint256 winnerId = candidateArray[0].id;
        uint256 maxScore = candidateArray[0].score;
        
        for (uint256 i = 1; i < candidateArray.length; i++) {
            if (candidateArray[i].score > maxScore) {
                maxScore = candidateArray[i].score;
                winnerId = candidateArray[i].id;
            }
        }
        
        return candidates[winnerId];
    }

    function registerAVoter() public {
        registeredVoters[msg.sender] = true;
    }

    /**
     * Emergency function to unregister a voter (only owner can call)
     * @param voter Address of the voter to unregister
     */
    function unregisterVoter(address voter) public onlyOwner {
        registeredVoters[voter] = false;
    }

    /**
     * Get candidate voting statistics
     * @param candidateId ID of the candidate
     * @return votes Number of votes received
     * @return rank Rank based on votes
     */
    function getCandidateStats(uint256 candidateId) public view returns (uint256 votes, uint256 rank) {
        Candidate memory candidate = candidates[candidateId];
        votes = candidate.score;
        
        // Calculate rank by counting how many candidates have fewer votes
        rank = 1;
        for (uint256 i = 0; i < candidateArray.length; i++) {
            if (candidateArray[i].score > candidate.score) {
                rank++;
            }
        }
        
        return (votes, rank);
    }

    /**
     * Check if a voter has already voted
     * @param voter Address of the voter
     * @return true if voter has voted, false otherwise
     */
    function hasVoterVoted(address voter) public view returns (bool) {
        return hasVoted[voter];
    }

    function checkIfVoterIsRegistered(address voter) public view returns (bool) {
        return registeredVoters[voter];
    }

    function voteForACandidate(uint256 id) public {
        if (registeredVoters[msg.sender] != true) revert ("Voter is not registered");
        if (hasVoted[msg.sender] != false) revert ("Voter has already voted");
        if (!isVotingActive()) revert ("Voting has ended");
        
        // require(registeredVoters[msg.sender], "Voter is not registered");
        Candidate memory candidateToVote = candidates[id]; // Get the candidate
        candidateToVote.score += 1;
        candidates[id] = candidateToVote;
        
        // Mark voter as having voted
        hasVoted[msg.sender] = true;

        emit userVoted(msg.sender, id, candidateToVote.name);
    }
}