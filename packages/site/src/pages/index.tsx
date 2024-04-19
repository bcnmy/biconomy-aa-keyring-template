import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-api';
import { ethers } from 'ethers';
import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import * as uuid from 'uuid';

import { Accordion, Card, ConnectButton } from '../components';
import BannerSection from '../components/BannerSection';
import {
  CardContainer,
  Container,
  Divider,
  DividerTitle,
  StyledBox,
} from '../components/styledComponents';
import { defaultSnapOrigin } from '../config';
import {
  ACCOUNT_RECOVERY_MODULE_ADDRESS,
  BICONOMY_ERC20_PAYMASTER_MULTICHAIN_ADDRESS,
  BICONOMY_SDK_NFT_MULTICHAIN_ADDRESS,
  POLYGON_MUMBAI_USDC,
} from '../config/constants';
import { MetamaskActions, MetaMaskContext } from '../hooks';
import { InputType } from '../types';
import type { KeyringState } from '../utils';
import { connectSnap, getSnap } from '../utils';
import { BiconomyAccountRecoveryAbi } from '../utils/abi/BiconomyAccountRecoveryAbi';
import { BiconomyImplementationAbi } from '../utils/abi/BiconomyImplementationAbi';
import { ERC20Abi } from '../utils/abi/ERC20Abi';
import { getMessageToSignByGuardian } from '../utils/accountRecovery';

const snapId = defaultSnapOrigin;

const initialState: {
  pendingRequests: KeyringRequest[];
  accounts: KeyringAccount[];
  useSynchronousApprovals: boolean;
} = {
  pendingRequests: [],
  accounts: [],
  useSynchronousApprovals: true,
};

const MethodButton = styled.button`
  width: 200px;
  background-color: #0376c9;
  color: #fff;
  border-radius: 999px;
  border: none;
  padding: 5px 20px;
  margin: 30px auto;

  &:hover {
    background-color: #0376ff;
    border: none;
    color: #fff;
  }
`;

const Index = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [snapState, setSnapState] = useState<KeyringState>(initialState);
  // Is not a good practice to store sensitive data in the state of
  // a component but for this case it should be ok since this is an
  // internal development and testing tool.
  const [guardianId, setGuardianId] = useState<string | null>();
  const [accountAddress, setAccountAddress] = useState<string | null>();
  const [privateKey, setPrivateKey] = useState<string | null>();
  const [feeToken, setFeeToken] = useState<string | null>(POLYGON_MUMBAI_USDC);
  const [salt, setSalt] = useState<string | null>();
  const [accountId, setAccountId] = useState<string | null>();
  const [accountObject, setAccountObject] = useState<string | null>();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [accountAddrInput, setAccountAddrInput] = useState('');
  // UserOp method state
  const [chainConfig, setChainConfigObject] = useState<string | null>();
  const [isErc20, setIsErc20] = useState(false);

  const client = new KeyringSnapRpcClient(snapId, window.ethereum);

  useEffect(() => {
    /**
     * Return the current state of the snap.
     *
     * @returns The current state of the snap.
     */
    async function getState() {
      if (!state.installedSnap) {
        return;
      }
      const accounts = await client.listAccounts();
      setSnapState({
        accounts,
      });
    }

    getState().catch((error) => console.error(error));
  }, [state.installedSnap]);

  const syncAccounts = async () => {
    const accounts = await client.listAccounts();
    setSnapState({
      ...snapState,
      accounts,
    });
  };

  const createAccount = async () => {
    const newAccount = await client.createAccount({
      privateKey: privateKey as string,
    });
    await syncAccounts();
    setAccountAddress(newAccount.address);
    // Review
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log('newAccount', newAccount);
    setAccountObject(JSON.stringify(newAccount));
    setAccountAddrInput(newAccount.address);
  };

  // UserOp methods (default to send from first AA account created)
  // Note: Could be used to set paymasterUrl (if getPaymasterAndData only requires userOp) or provide fee mode, preferred fee token, bundler url etc
  const setChainConfig = async () => {
    if (!chainConfig) {
      return;
    }
    const request: KeyringRequest = {
      id: uuid.v4(),
      scope: '',
      account: uuid.v4(),
      request: {
        method: 'snap.internal.setConfig',
        params: [JSON.parse(chainConfig)],
      },
    };
    await client.submitRequest(request);
  };

  const mintNFT = async () => {
    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    const accounts: any = await ethereum.request({ method: 'eth_accounts' });

    const nftInterface = new ethers.utils.Interface([
      'function safeMint(address _to)',
    ]);

    const nftContract = new ethers.Contract(
      BICONOMY_SDK_NFT_MULTICHAIN_ADDRESS,
      nftInterface,
      signer,
    );

    await nftContract.safeMint(accounts[0]);
  };

  const sendAnyCustomTransactionExample = async () => {
    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    // Review : test signer.getAddress()
    const accounts: any = await ethereum.request({ method: 'eth_accounts' });

    const nftInterface = new ethers.utils.Interface([
      'function safeMint(address _to)',
    ]);

    const transactionDetails = {
      accountAddress: accounts[0],
      to: BICONOMY_SDK_NFT_MULTICHAIN_ADDRESS,
      value: '0x0',
      data: nftInterface.encodeFunctionData('safeMint', [accounts[0]]),
    };

    const request: KeyringRequest = {
      id: uuid.v4(),
      scope: '',
      account: uuid.v4(),
      request: {
        method: 'snap.account.sendTransaction',
        params: [transactionDetails],
      },
    };
    await client.submitRequest(request);
  };

  const setAccountRecoveryFromCompanionDapp = async (
    guardianIdPassed: string,
  ) => {
    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    const accounts: any = await ethereum.request({ method: 'eth_accounts' });
    // const address = await signer.getAddress();

    const accountRecoveryInterface = new ethers.utils.Interface(
      BiconomyAccountRecoveryAbi,
    );

    const guardian = guardianIdPassed ?? guardianId;

    // Note: hardcoded values could come from a input fields
    const accountRecoverySetupData =
      accountRecoveryInterface.encodeFunctionData('initForSmartAccount', [
        [guardian],
        [[16741936496, 0]], // validUntil = 1 year from now, validAfter = 0
        1, // recoveryThreshold = length of guardians (in this case 1)
        15, // secruity delay
        1, // num recoveries allowed
      ]);

    console.log('accountRecoverySetupData', accountRecoverySetupData);

    const smartAccountInterface = new ethers.utils.Interface(
      BiconomyImplementationAbi,
    );

    const smartAccount = new ethers.Contract(
      accounts[0],
      smartAccountInterface,
      signer,
    );

    await smartAccount.setupAndEnableModule(
      ACCOUNT_RECOVERY_MODULE_ADDRESS,
      accountRecoverySetupData,
    );
  };

  const approveTokenPaymaster = async (erc20Address: string) => {
    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    const accounts: any = await ethereum.request({ method: 'eth_accounts' });
    console.log('current account ', accounts[0]);

    const erc20Interface = new ethers.utils.Interface(ERC20Abi);

    const feeTokenContract = new ethers.Contract(
      erc20Address,
      erc20Interface,
      signer,
    );

    await feeTokenContract.approve(
      BICONOMY_ERC20_PAYMASTER_MULTICHAIN_ADDRESS,
      ethers.constants.MaxUint256,
    );
  };

  const signMessage = async (message: any) => {
    // Notice: this could be done rather at beginning / After every createAccount
    // await window.ethereum.request({ method: 'eth_requestAccounts' });

    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    const response = await signer.signMessage(ethers.utils.arrayify(message));
    console.log('sig', response);
    return response;
  };

  const signAndSetGuardianId = async (smartAccount: string) => {
    console.log('SA address being passed here ', smartAccount);
    const message = await getMessageToSignByGuardian(smartAccount);
    const signature: any = await signMessage(message);
    console.log('signature', signature);
    const guardianIdComputed = ethers.utils.keccak256(signature);
    console.log('guardianIdComputed', guardianIdComputed);
    setGuardianId(guardianIdComputed);
    return guardianIdComputed;
  };

  const handleConnectClick = async () => {
    try {
      await connectSnap();
      const installedSnap = await getSnap();
      dispatch({
        type: MetamaskActions.SetInstalled,
        payload: installedSnap,
      });
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  // Could possibly have paymasterUrl
  // For simple account keyring it used to be paymaster address and verifying paymaster pk
  const userOpMethods = [
    {
      name: 'Set Chain Config',
      description:
        'Set account abstraction configuration options for the current chain.',
      inputs: [
        {
          id: 'set-chain-config-chain-config-object',
          title: 'Chain Config Object',
          type: InputType.TextArea,
          placeholder:
            '{\n' +
            '    "entryPoint": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",\n' +
            '    "bundlerUrl": "https://bundler.example.com/rpc",\n' +
            '}',
          onChange: (event: any) =>
            setChainConfigObject(event.currentTarget.value),
        },
      ],
      action: {
        disabled: Boolean(accountId),
        callback: async () => await setChainConfig(),
        label: 'Set Chain Configs',
      },
      successMessage: 'Chain Config Set',
    },
  ];

  // TODO: Token approval of USDC as per the selected chainId (if supported)
  const accountManagementMethods = [
    {
      name: 'Sign a Message by Guardian',
      description: 'Getting a Guardian Id',
      inputs: [
        {
          id: 'smart account address',
          title: "Friend's SA address",
          value: accountAddrInput,
          type: InputType.TextField,
          placeholder: 'E.g. 0x4E720e21D8BEFA24da71F2eacE864137e0166C6C',
          onChange: (event: any) =>
            setAccountAddrInput(event.currentTarget.value),
        },
      ],
      action: {
        callback: async () => {
          const res = await signAndSetGuardianId(accountAddress as string);
          return res;
        },
        label: 'Onboard guardian',
      },
      successMessage: guardianId,
    },
    {
      name: 'Setup Recovery and deploy account',
      description: 'Setting up recovery on chain using set guardian',
      inputs: [
        {
          id: 'smart account guardian id',
          title: 'Generated guardian Id',
          value: guardianId,
          type: InputType.TextField,
          placeholder:
            'E.g. 0x4277a27c57e92d7f5f7d8b31b887d63eca97cfb3a94fcecbf647cb13258dc76a',
          onChange: (event: any) => setGuardianId(event.currentTarget.value),
        },
      ],
      action: {
        callback: async () =>
          await setAccountRecoveryFromCompanionDapp(guardianId as string),
        label: 'Set Recovery',
      },
    },
    {
      name: 'Approve Token Paymaster',
      // description: 'Approve Token Paymaster',
      tokenPaymaster: {
        id: 'ERC20 token address',
        title: 'Fee token address',
        value: feeToken,
        placeholder: 'E.g. 0xdA5289fCAAF71d52a80A254da614a192b693e977',
        setIsErc20: (event: any) => setIsErc20(event.target.checked),
        isErc20,
      },
      action: {
        callback: async () => await approveTokenPaymaster(feeToken as string),
        label: 'Approve',
        disabled: !isErc20,
      },
      successMessage: 'Sending UserOp to Approve token paymaster',
    },
    {
      name: 'Mint NFT',
      description: 'Mint NFT',
      action: {
        callback: async () => await mintNFT(),
        label: 'Mint',
      },
      successMessage: 'Sending UserOp to Mint an NFT',
    },
  ];
  return (
    <Container>
      <BannerSection />
      {!state.installedSnap && (
        <CardContainer>
          <Card
            content={{
              title: 'Connect',
              description:
                'Get started by connecting to and installing the example snap.',
              button: (
                <ConnectButton
                  onClick={handleConnectClick}
                  disabled={!state.hasMetaMask}
                />
              ),
            }}
            disabled={!state.hasMetaMask}
          />
        </CardContainer>
      )}

      {accountAddress ? (
        <>
          <StyledBox sx={{ flexGrow: 1, maxWidth: 800, marginTop: 3 }}>
            {/* Not using this for now*/}
            {/* <DividerTitle>Options</DividerTitle>*/}
            {/* <Toggle*/}
            {/*  title="Use Synchronous Approval"*/}
            {/*  defaultChecked={snapState.useSynchronousApprovals}*/}
            {/*  onToggle={handleUseSyncToggle}*/}
            {/*  enabled={Boolean(state.installedSnap)}*/}
            {/*/ >*/}
            {/* <Divider>&nbsp;</Divider>*/}
            <DividerTitle>Methods</DividerTitle>
            <Accordion items={accountManagementMethods} />
            <Divider />
            {/* <DividerTitle>UserOp Methods</DividerTitle>
            <Accordion items={userOpMethods} /> */}
            <Divider />
          </StyledBox>
        </>
      ) : (
        <StyledBox sx={{ flexGrow: 1, maxWidth: 200 }}>
          <MethodButton
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onClick={async () => {
              try {
                await createAccount();
              } catch (error: any) {
                console.error(error);
              }
            }}
          >
            Create Account
          </MethodButton>
          {/* Add the new JSX here */}
          {guardianId && (
            <div>
              <p>Guardian ID: {guardianId}</p>
            </div>
          )}
        </StyledBox>
      )}
    </Container>
  );
};

export default Index;
