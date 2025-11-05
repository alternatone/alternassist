/**
 * Calculation Service
 * All business logic calculations centralized in one place
 */

class CalculationService {
    constructor(configService) {
        this.config = configService;
        this.rates = this.config.getRates();
    }

    /**
     * Calculate music cost
     * @param {number} minutes - Number of minutes
     * @param {number} rate - Rate per minute (optional, uses config default)
     * @returns {number} Total cost
     */
    calculateMusicCost(minutes, rate = null) {
        const effectiveRate = rate || this.rates.MUSIC_RATE;
        return Number(minutes) * effectiveRate;
    }

    /**
     * Calculate post-production cost
     * @param {number} hours - Number of hours
     * @param {number} dayRate - Rate per day (optional, uses config default)
     * @param {number} hoursPerDay - Hours per day (optional, uses config default)
     * @returns {number} Total cost
     */
    calculatePostCost(hours, dayRate = null, hoursPerDay = null) {
        const effectiveDayRate = dayRate || this.rates.DAY_RATE;
        const effectiveHoursPerDay = hoursPerDay || this.rates.HOURS_PER_DAY;

        const days = this.roundToHalfDay(hours, effectiveHoursPerDay);
        return days * effectiveDayRate;
    }

    /**
     * Round hours to nearest half day
     * @param {number} hours - Number of hours
     * @param {number} hoursPerDay - Hours per day (optional)
     * @returns {number} Rounded days
     */
    roundToHalfDay(hours, hoursPerDay = null) {
        const effectiveHoursPerDay = hoursPerDay || this.rates.HOURS_PER_DAY;
        const days = hours / effectiveHoursPerDay;
        return Math.round(days * 2) / 2; // Round to nearest 0.5
    }

    /**
     * Calculate bundle discount
     * @param {number} musicCost - Music cost
     * @param {number} postCost - Post-production cost
     * @param {number} discountRate - Discount rate (optional, uses config default)
     * @returns {number} Discount amount
     */
    calculateBundleDiscount(musicCost, postCost, discountRate = null) {
        const effectiveRate = discountRate || this.rates.BUNDLE_DISCOUNT;

        // Only apply discount if both services are present
        if (musicCost > 0 && postCost > 0) {
            const subtotal = musicCost + postCost;
            return subtotal * effectiveRate;
        }

        return 0;
    }

    /**
     * Calculate subtotal (before tax)
     * @param {number} musicCost - Music cost
     * @param {number} postCost - Post-production cost
     * @returns {number} Subtotal
     */
    calculateSubtotal(musicCost, postCost) {
        return Number(musicCost) + Number(postCost);
    }

    /**
     * Calculate taxes
     * @param {number} subtotal - Subtotal amount
     * @param {number} discount - Discount amount
     * @param {number} taxRate - Tax rate (optional, uses config default)
     * @returns {number} Tax amount
     */
    calculateTaxes(subtotal, discount, taxRate = null) {
        const effectiveTaxRate = taxRate || this.rates.TAX_RATE;
        const taxableAmount = subtotal - discount;
        return taxableAmount * effectiveTaxRate;
    }

    /**
     * Calculate total (including tax)
     * @param {number} subtotal - Subtotal amount
     * @param {number} discount - Discount amount
     * @param {number} taxes - Tax amount
     * @returns {number} Total amount
     */
    calculateTotal(subtotal, discount, taxes) {
        return subtotal - discount + taxes;
    }

    /**
     * Calculate complete estimate
     * @param {Object} params - Estimate parameters
     * @param {number} params.musicMinutes - Music minutes
     * @param {number} params.postHours - Post-production hours
     * @param {boolean} params.applyBundleDiscount - Whether to apply bundle discount
     * @returns {Object} Complete estimate breakdown
     */
    calculateEstimate(params) {
        const {
            musicMinutes = 0,
            postHours = 0,
            applyBundleDiscount = true
        } = params;

        const musicCost = this.calculateMusicCost(musicMinutes);
        const postCost = this.calculatePostCost(postHours);
        const subtotal = this.calculateSubtotal(musicCost, postCost);

        const discount = applyBundleDiscount
            ? this.calculateBundleDiscount(musicCost, postCost)
            : 0;

        const taxes = this.calculateTaxes(subtotal, discount);
        const total = this.calculateTotal(subtotal, discount, taxes);

        return {
            musicCost,
            postCost,
            postDays: this.roundToHalfDay(postHours),
            subtotal,
            discount,
            taxes,
            total,
            breakdown: {
                musicMinutes,
                musicRate: this.rates.MUSIC_RATE,
                postHours,
                postDays: this.roundToHalfDay(postHours),
                dayRate: this.rates.DAY_RATE,
                taxRate: this.rates.TAX_RATE,
                discountRate: applyBundleDiscount ? this.rates.BUNDLE_DISCOUNT : 0
            }
        };
    }

    /**
     * Calculate invoice totals
     * @param {Object} params - Invoice parameters
     * @returns {Object} Invoice calculation
     */
    calculateInvoice(params) {
        // Same as estimate calculation
        return this.calculateEstimate(params);
    }

    /**
     * Calculate payment amount (handles split payments)
     * @param {number} totalAmount - Total invoice amount
     * @param {number} percentage - Percentage to calculate (e.g., 50 for 50%)
     * @returns {number} Payment amount
     */
    calculatePaymentAmount(totalAmount, percentage) {
        return (totalAmount * percentage) / 100;
    }

    /**
     * Calculate outstanding balance
     * @param {number} totalAmount - Total invoice amount
     * @param {Array} payments - Array of payment amounts
     * @returns {number} Outstanding balance
     */
    calculateOutstandingBalance(totalAmount, payments = []) {
        const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        return totalAmount - paidAmount;
    }

    /**
     * Calculate late fee
     * @param {number} amount - Outstanding amount
     * @param {number} daysLate - Number of days late
     * @param {number} monthlyRate - Monthly late fee rate (optional)
     * @returns {number} Late fee amount
     */
    calculateLateFee(amount, daysLate, monthlyRate = null) {
        const effectiveRate = monthlyRate || this.config.get('business.LATE_FEE_RATE', 0.015);
        const dailyRate = effectiveRate / 30; // Convert monthly to daily
        return amount * dailyRate * daysLate;
    }

    /**
     * Calculate days until due date
     * @param {string|Date} dueDate - Due date
     * @returns {number} Days until due (negative if overdue)
     */
    calculateDaysUntilDue(dueDate) {
        const due = new Date(dueDate);
        const now = new Date();
        const diffTime = due - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    /**
     * Check if invoice is overdue
     * @param {string|Date} dueDate - Due date
     * @returns {boolean} True if overdue
     */
    isOverdue(dueDate) {
        return this.calculateDaysUntilDue(dueDate) < 0;
    }

    /**
     * Calculate project timeline
     * @param {Object} scopeData - Project scope data
     * @returns {Object} Timeline estimate
     */
    calculateProjectTimeline(scopeData) {
        const {
            music = 0,
            dialogue = 0,
            soundDesign = 0,
            mix = 0
        } = scopeData;

        const totalHours = music + dialogue + soundDesign + mix;
        const totalDays = this.roundToHalfDay(totalHours);

        // Rough timeline breakdown (can be customized)
        const timeline = {
            music: music > 0 ? this.roundToHalfDay(music) : 0,
            dialogue: dialogue > 0 ? this.roundToHalfDay(dialogue) : 0,
            soundDesign: soundDesign > 0 ? this.roundToHalfDay(soundDesign) : 0,
            mix: mix > 0 ? this.roundToHalfDay(mix) : 0,
            total: totalDays
        };

        return timeline;
    }

    /**
     * Calculate project profitability
     * @param {number} revenue - Project revenue
     * @param {number} expenses - Project expenses
     * @returns {Object} Profitability metrics
     */
    calculateProfitability(revenue, expenses) {
        const profit = revenue - expenses;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        return {
            revenue,
            expenses,
            profit,
            margin
        };
    }

    /**
     * Calculate year-to-date totals
     * @param {Array} transactions - Array of transactions
     * @returns {Object} YTD totals
     */
    calculateYTD(transactions) {
        const currentYear = new Date().getFullYear();

        const filtered = transactions.filter(t => {
            const txYear = new Date(t.date).getFullYear();
            return txYear === currentYear;
        });

        const income = filtered
            .filter(t => t.taxCategory && t.taxCategory.startsWith('income'))
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        const expenses = filtered
            .filter(t => t.taxCategory && t.taxCategory.startsWith('expense'))
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        const net = income - expenses;

        return {
            income,
            expenses,
            net,
            transactionCount: filtered.length
        };
    }
}

module.exports = CalculationService;
