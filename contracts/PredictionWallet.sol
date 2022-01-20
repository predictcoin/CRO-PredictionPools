// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.2;

import "./interfaces/IBEP20.sol";
import './utils/SafeBEP20.sol';
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PredictionWallet is AccessControl, ReentrancyGuard {
    using SafeBEP20 for IBEP20;
    // The PRED TOKEN!
    IBEP20 public CRP;

    constructor(
        IBEP20 _CRP
    ) {
        CRP = _CRP;
        _setRoleAdmin("loserPredictionPool", "loserPredictionPoolAdmin");
        _setRoleAdmin("winnerPredictionPool", "winnerPredictionPoolAdmin");
        _setupRole("loserPredictionPoolAdmin", _msgSender());
        _setupRole("winnerPredictionPoolAdmin", _msgSender());
    }
    

    // Safe pred transfer function, just in case if rounding error causes pool to not have enough PREDs.
    function safeCRPTransfer(address _to, uint256 _amount) external onlyRole("winnerPredictionPool") nonReentrant returns(uint) {
        uint256 predBal = CRP.balanceOf(address(this));
        if (_amount > predBal) {
            CRP.safeTransfer(_to, predBal);
            return predBal;
        } else {
            CRP.safeTransfer(_to, _amount);
            return _amount;
        }
    }
    
    function safeCROTransfer(address _to, uint256 _amount) external onlyRole("loserPredictionPool") nonReentrant returns(uint) {
        uint256 CROBal = address(this).balance;
        if(_amount > CROBal) {
            (bool success,) = _to.call{value: CROBal}("");
            require(success, "unable to send CRO");
            return CROBal;
        } else{
            (bool success,) = _to.call{value: _amount}("");
            require(success, "unable to send CRO");
            return _amount;
        }
    }
    
    function safeTokenTransfer(IBEP20 _token, address _to, uint256 _amount) external onlyRole("winnerPredictionPool") nonReentrant returns(uint) {
        uint256 tokenBal = _token.balanceOf(address(this));
        if (_amount > tokenBal) {
            _token.safeTransfer(_to, tokenBal);
            return tokenBal;
        } else {
            _token.safeTransfer(_to, _amount);
            return _amount;
        }
    }
    
    receive () external payable{
        
    }
}