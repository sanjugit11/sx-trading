"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

interface Web3ContextType {
  address: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
  isMetaMask: boolean;
  connect: (mockAccountIndex: number) => Promise<void>;
  connectMetaMask: () => Promise<void>;
  disconnect: () => void;
  sendTransaction: (contractAddress: string, abi: string[], method: string, args: any[]) => Promise<any>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

const MOCK_KEYS = [
  // Account #1: User
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  // Account #2: Device 2 / Admin
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  // Account #3: Device 3 / Admin
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  // Account #0: Deployer / Super Admin
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
];

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isMetaMask, setIsMetaMask] = useState<boolean>(false);
  const [mockIndex, setMockIndex] = useState<number>(-1);

  useEffect(() => {
    const savedToken = localStorage.getItem("sx_token");
    const savedAddress = localStorage.getItem("sx_address");
    const savedIsMetaMask = localStorage.getItem("sx_is_metamask") === "true";
    const savedMockIndex = Number(localStorage.getItem("sx_mock_index") || "-1");

    if (savedToken && savedAddress) {
      setToken(savedToken);
      setAddress(savedAddress);
      setIsAuthenticated(true);
      setIsMetaMask(savedIsMetaMask);
      setMockIndex(savedMockIndex);
    }
  }, []);

  // Connect using a mock wallet (for testing/automation)
  const connect = async (mockAccountIndex: number) => {
    setLoading(true);
    setError(null);
    try {
      const privKey = MOCK_KEYS[mockAccountIndex];
      const wallet = new ethers.Wallet(privKey);
      const walletAddr = wallet.address;

      const message = `Sign in to SX Trading Suite: ${walletAddr.toLowerCase()}`;
      const signature = await wallet.signMessage(message);

      const res = await axios.post("/api/auth/verify", {
        address: walletAddr,
        message,
        signature
      });

      const { accessToken } = res.data;
      
      setAddress(walletAddr);
      setToken(accessToken);
      setIsAuthenticated(true);
      setIsMetaMask(false);
      setMockIndex(mockAccountIndex);
      
      localStorage.setItem("sx_token", accessToken);
      localStorage.setItem("sx_address", walletAddr);
      localStorage.setItem("sx_is_metamask", "false");
      localStorage.setItem("sx_mock_index", String(mockAccountIndex));
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || "Signature verification failed");
    } finally {
      setLoading(false);
    }
  };

  // Helper to ensure the wallet is connected to Hoodi Testnet (560048)
  const ensureHoodiNetwork = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(560048)) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x88bb0' }], // Hex for 560048
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            try {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: '0x88bb0',
                    chainName: 'Hoodi Testnet',
                    nativeCurrency: {
                      name: 'Hoodi Ether',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                    rpcUrls: ['https://rpc.hoodi.ethpandaops.io'],
                  },
                ],
              });
            } catch (addError) {
              console.error("Failed to add Hoodi Testnet to MetaMask:", addError);
            }
          } else {
            console.error("Failed to switch to Hoodi Testnet:", switchError);
          }
        }
      }
    }
  };

  // Connect using real browser MetaMask wallet
  const connectMetaMask = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!(window as any).ethereum) {
        throw new Error("MetaMask is not installed. Please install MetaMask extension.");
      }

      await ensureHoodiNetwork();

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length === 0) {
        throw new Error("No accounts found. Please unlock MetaMask.");
      }

      const signer = await provider.getSigner();
      const walletAddr = await signer.getAddress();

      const message = `Sign in to SX Trading Suite: ${walletAddr.toLowerCase()}`;
      const signature = await signer.signMessage(message);

      const res = await axios.post("/api/auth/verify", {
        address: walletAddr,
        message,
        signature
      });

      const { accessToken } = res.data;
      
      setAddress(walletAddr);
      setToken(accessToken);
      setIsAuthenticated(true);
      setIsMetaMask(true);
      setMockIndex(-1);
      
      localStorage.setItem("sx_token", accessToken);
      localStorage.setItem("sx_address", walletAddr);
      localStorage.setItem("sx_is_metamask", "true");
      localStorage.setItem("sx_mock_index", "-1");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "MetaMask SIWE verification failed");
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setToken(null);
    setIsAuthenticated(false);
    setIsMetaMask(false);
    setMockIndex(-1);
    localStorage.removeItem("sx_token");
    localStorage.removeItem("sx_address");
    localStorage.removeItem("sx_is_metamask");
    localStorage.removeItem("sx_mock_index");
  };

  // Execute an on-chain transaction through MetaMask or deterministic key fallback
  const sendTransaction = async (contractAddress: string, abi: string[], method: string, args: any[]) => {
    try {
      let signer: ethers.Signer;

      if (isMetaMask && (window as any).ethereum) {
        // Ensure network is Hoodi Testnet before transaction
        await ensureHoodiNetwork();
        // Request confirmation via MetaMask browser provider
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        signer = await provider.getSigner();
      } else {
        // Fallback to local hardhat provider using deterministic mock account
        const fallbackProvider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
        const activeIndex = mockIndex >= 0 ? mockIndex : 0;
        signer = new ethers.Wallet(MOCK_KEYS[activeIndex], fallbackProvider);
      }

      const txSignerAddress = await signer.getAddress();
      console.log(`[Web3Context] Executing transaction: ${method} on contract: ${contractAddress}. Signer Address: ${txSignerAddress}`);

      // Check and auto-approve USDT for core trading contracts if needed
      const isTradingContract = [
        CONTRACT_ADDRESSES.sxpt.toLowerCase(),
        CONTRACT_ADDRESSES.sxlt.toLowerCase(),
        CONTRACT_ADDRESSES.sxls.toLowerCase(),
        CONTRACT_ADDRESSES.sxhop.toLowerCase()
      ].includes(contractAddress.toLowerCase());

      if (isTradingContract) {
        // Query allowance using the Hoodi RPC provider directly to avoid MetaMask network mismatch issues
        const readProvider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
        const usdtReadContract = new ethers.Contract(CONTRACT_ADDRESSES.usdt, CONTRACT_ABIS.usdt, readProvider);
        const userAddr = await signer.getAddress();
        const currentAllowance = await usdtReadContract.allowance(userAddr, contractAddress);
        const threshold = ethers.parseEther("1000000"); // 1 million USDT threshold
        if (currentAllowance < threshold) {
          console.log(`Allowance is ${ethers.formatEther(currentAllowance)} USDT. Requesting approval for ${contractAddress}...`);
          // Approval MUST be signed by the user's MetaMask signer
          const usdtWriteContract = new ethers.Contract(CONTRACT_ADDRESSES.usdt, CONTRACT_ABIS.usdt, signer);
          const approveTx = await usdtWriteContract.approve(contractAddress, ethers.MaxUint256);
          await approveTx.wait();
          console.log("USDT approval confirmed!");
        }
      }

      const contract = new ethers.Contract(contractAddress, abi, signer);
      
      // Perform gas estimation for premium status tracking
      let gasLimit;
      try {
        gasLimit = await contract[method].estimateGas(...args);
      } catch (err) {
        console.warn("Gas estimation failed, using default limit:", err);
      }

      const tx = await contract[method](...args, {
        gasLimit: gasLimit ? (gasLimit * BigInt(120)) / BigInt(100) : undefined // add 20% safety buffer
      });

      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      console.error(`Transaction failed in ${method}:`, err);
      throw new Error(err.reason || err.message || "On-chain transaction execution rejected.");
    }
  };

  return (
    <Web3Context.Provider
      value={{
        address,
        isConnected: !!address,
        isAuthenticated,
        token,
        loading,
        error,
        isMetaMask,
        connect,
        connectMetaMask,
        disconnect,
        sendTransaction
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
};
