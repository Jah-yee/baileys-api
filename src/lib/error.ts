export function getError(error: unknown) {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "string") {
		return new Error(error);
	}

	return new Error("Unknown error");
}

export function serializeError(error: unknown) {
	const err = getError(error);
	return {
		name: err.name,
		message: err.message,
	};
}
