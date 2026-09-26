import {
  GENLAYER_EXPLORER_URL,
  STUDIONET_CONTRACT_ADDRESS,
} from './public-config';

const configuredAddress = import.meta.env.VITE_TRUSTGATE_CONTRACT_ADDRESS?.trim()
  || STUDIONET_CONTRACT_ADDRESS;

export const contractAddress = /^0x[0-9a-fA-F]{40}$/.test(configuredAddress)
  ? configuredAddress
  : null;

export const contractConfigured = contractAddress !== null;

export const explorerUrl = import.meta.env.VITE_GENLAYER_EXPLORER_URL?.trim()
  || GENLAYER_EXPLORER_URL;
