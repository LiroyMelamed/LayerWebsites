// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// CRA/Jest sometimes fails to run with ESM-only deps (e.g. axios).
// Mock axios for the test environment so importing App doesn't crash.
jest.mock('axios', () => {
	const mockInterceptors = {
		request: { use: jest.fn() },
		response: { use: jest.fn() },
	};

	const mockInstance = {
		interceptors: mockInterceptors,
		get: jest.fn(),
		post: jest.fn(),
		put: jest.fn(),
		patch: jest.fn(),
		delete: jest.fn(),
	};

	const mockAxios = {
		create: jest.fn(() => mockInstance),
		...mockInstance,
	};

	return {
		__esModule: true,
		default: mockAxios,
	};
});

// Avoid Jest ESM parsing issues from chart.js via react-chartjs-2.
jest.mock('react-chartjs-2', () => {
	const Stub = () => null;
	return {
		__esModule: true,
		Doughnut: Stub,
		Pie: Stub,
		Line: Stub,
		Bar: Stub,
	};
});

jest.mock('chart.js', () => ({
	__esModule: true,
	Chart: { register: jest.fn() },
	ArcElement: {},
	Tooltip: {},
	Legend: {},
}));

// Avoid Jest ESM parsing issues from react-pdf/pdfjs-dist.
jest.mock('react-pdf', () => {
	function Document({ children }) {
		return children ?? null;
	}

	function Page() {
		return null;
	}

	return {
		__esModule: true,
		Document,
		Page,
		pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
	};
});

jest.mock('pdfjs-dist', () => ({
	__esModule: true,
}));
