import React from 'react';
import { render, waitFor } from '@testing-library/react';
import ShortSignRedirectScreen from '../screens/signingScreen/ShortSignRedirectScreen';
const mockNavigate = jest.fn();
const mockResolve = jest.fn();
let mockSlug = 'Abcd_123';
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useParams: () => ({ slug: mockSlug }) }));
jest.mock('../api/signingFilesApi', () => ({ __esModule: true, default: { resolvePublicSigningShortLink: (...args) => mockResolve(...args) } }));
jest.mock('../navigation/LoginStack', () => ({ LoginStackName: '/LoginStack' }));
jest.mock('../screens/loginScreen/LoginScreen', () => ({ LoginScreenName: '/LoginScreen' }));
beforeEach(() => { jest.clearAllMocks(); mockSlug = 'Abcd_123'; });
test.each([
  ['sign', '/ViewSignedDocument/Signing?token=synthetic%2Ba%2Fb'],
  ['view', '/ViewSignedDocument?token=synthetic%2Ba%2Fb'],
])('resolved %s link stays in browser and keeps its purpose', async (purpose, destination) => {
  mockResolve.mockResolvedValue({ data: { purpose, token: 'synthetic+a/b' } });
  render(<ShortSignRedirectScreen />);
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(destination, { replace: true }));
  expect(mockResolve).toHaveBeenCalledWith('Abcd_123');
});
test('invalid slug never calls the API or navigates', async () => {
  mockSlug = '../bad'; render(<ShortSignRedirectScreen />);
  await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled());
  expect(mockResolve).not.toHaveBeenCalled();
});
