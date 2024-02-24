import React from 'react';
import styled from 'styled-components';

const AccordionContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  margin 50px auto 20px auto;
`;

const Title = styled.p`
  font-size: 36px;
  font-weight: bold;
  margin: auto;
  margin-bottom: 20px;
`;

const SubContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: auto;
  max-width: 650px;
  border-bottom: 1px solid #eaeaea;
`;

const SubTitle = styled.p`
  font-size: 16px;
  margin: auto;
  margin-bottom: 5px;
`;

export const BannerSection = () => {
  return (
    <AccordionContainer>
      <Title>Biconomy Smart Account</Title>
      <SubContainer>
        <SubTitle>
          Create and add a smart account to your metamask wallet.
        </SubTitle>
        <SubTitle style={{ marginBottom: 20 }}>
          Pay for gas with ERC20 tokens. Use an existing Metamask account for
          recovery.
        </SubTitle>
      </SubContainer>
    </AccordionContainer>
  );
};

export default BannerSection;
