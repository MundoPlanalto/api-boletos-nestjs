export interface DueInstallments {
    installmentId: number;
    currentBalance: number;
    latePaymentInterest: number;
    adjustedValue: number;
    additionalValue: number;
    originalValue: number;
    dueDate: string;
    generatedBoleto: boolean;
    monetaryCorrectionValue: number;
    baseDateOfCorrection: string;
    conditionType: string;
    indexerCode: number;
    indexerName: string;
    indexerValueBaseDate: number;
    indexerValueCalculationDate: number;
    installmentNumber: string;
}

export interface Results {
    billReceivableId: number;
    documentId: string;
    paidInstallments: DueInstallments[];
    dueInstallments: DueInstallments[];
    payableInstallments: DueInstallments[];
}

export interface CurrentDebitBalance {
    resultSetMetadata: {
        count: number;
        offset: number;
        limit: number;
    };
    results: Results[];
}