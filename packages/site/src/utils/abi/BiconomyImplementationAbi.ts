export const BiconomyImplementationAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'setupContract',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'setupData',
        type: 'bytes',
      },
    ],
    name: 'setupAndEnableModule',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
