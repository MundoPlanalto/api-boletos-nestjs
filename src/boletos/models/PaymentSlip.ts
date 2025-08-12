export interface Results {
    urlReport: string;
    digitableNumber: string;
    parameter1207: string;
}


export interface PaymentSlip {
    results: Results[];
}

export default PaymentSlip;