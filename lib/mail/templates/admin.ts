
export function getWithdrawTemplate(totalWallets: any, totalUSDC: any, totalEth: any, successfulFunds: any, failedFunds: any, successfulWithdrawals: any, failedWithdrawals: any) {

    console.log('successfulWithdrawals', successfulWithdrawals);
    console.log('successfulFunds', successfulFunds);

    const summaryHtml = `
                    <div style="font-family: Arial, sans-serif; color: #333; max-width: 700px; margin: auto;">
                        <h2 style="color: #2c3e50;">Withdrawal Process Completed. </h2>                        
                        <p style="font-size: 14px; color: #555;">
                        The withdrawal process has been completed successfully. Below is the summary:
                        </p>
    
                        <h3 style="margin-top: 20px; color: #2c3e50;">Summary</h3>
                        <ul style="list-style: none; padding: 0; font-size: 14px;">
                        <li><strong>Total Wallets Involved:</strong> ${totalWallets}</li>
                        <li><strong>Total Funds Withdrawn:</strong> ${totalUSDC} USDC</li>
                        <li><strong>Total ETH Funded:</strong> ${totalEth} ETH</li>
                        </ul>
    
                        <h3 style="margin-top: 20px; color: #2c3e50;">Funding Summary</h3>
                        <p><strong>Successful:</strong> ${successfulFunds?.length}</p>
                        <ul style="font-size: 13px; color: #444;">
                        ${successfulFunds.map(j => `
                            <li>
                            <strong>Address:</strong> ${j.address}<br/>
                            <strong>Amount:</strong> ${j.amount} ETH<br/>
                            <strong>Tx:</strong> ${j.txId}
                            </li>
                        `).join('')}
                        </ul>
                        <p><strong>Failed:</strong> ${failedFunds?.length}</p>
                        <ul style="font-size: 13px; color: #b00020;">
                        ${failedFunds?.map(j => `
                            <li>
                            <strong>Address:</strong> ${j.address}<br/>
                            <strong>Error:</strong> ${j.error || 'Unknown'}
                            </li>
                        `).join('')}
                        </ul>
    
                        <h3 style="margin-top: 20px; color: #2c3e50;">Withdrawal Summary</h3>
                        <p><strong>Successful:</strong> ${successfulWithdrawals?.length}</p>
                        <ul style="font-size: 13px; color: #444;">
                        ${successfulWithdrawals?.map(j => `
                            <li>
                            <strong>Address:</strong> ${j.address}<br/>
                            <strong>Amount:</strong> ${j.amount} USDC<br/>
                            <strong>Tx:</strong> ${j.txId}
                            </li>
                        `).join('')}
                        </ul>
                        <p><strong>Failed:</strong> ${failedWithdrawals?.length}</p>
                        <ul style="font-size: 13px; color: #b00020;">
                        ${failedWithdrawals?.map(j => `
                            <li>
                            <strong>Address:</strong> ${j.address}<br/>
                            <strong>Amount:</strong> ${j.amount} USDC<br/>
                            <strong>Error:</strong> ${j.error || 'Unknown'}
                            </li>
                        `).join('')}
                        </ul>
    
                        <hr style="margin-top: 30px; border: 0; border-top: 1px solid #ddd;" />
                        <p style="font-size: 12px; color: #888; text-align: center;">
                        This is an automated message from Ken Admin System. Please do not reply directly to this email.
                        </p>
                    </div>
    `;
    return summaryHtml
}