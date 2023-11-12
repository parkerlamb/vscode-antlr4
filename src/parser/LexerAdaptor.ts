/*
 * This file is released under the MIT license.
 * Copyright (c) 2016, 2020, Mike Lischke
 *
 * See LICENSE file for more info.
 */

/* eslint-disable @typescript-eslint/naming-convention, no-underscore-dangle */

import { CharStream, Lexer, Token } from "antlr4ng";

import { ANTLRv4Lexer } from "./ANTLRv4Lexer.js";

export abstract class LexerAdaptor extends Lexer {
    /**
     *  Generic type for OPTIONS, TOKENS and CHANNELS
     */
    static #PREQUEL_CONSTRUCT = -10;
    static #OPTIONS_CONSTRUCT = -11;

    #currentRuleType: number = Token.INVALID_TYPE;
    #insideOptionsBlock: boolean = false;

    public constructor(input: CharStream) {
        super(input);

        /**
         * Track whether we are inside of a rule and whether it is lexical parser. _currentRuleType==Token.INVALID_TYPE
         * means that we are outside of a rule. At the first sign of a rule name reference and _currentRuleType
         * ==invalid, we can assume that we are starting a parser rule. Similarly, seeing a token reference when not
         * already in rule means starting a token rule. The terminating ';' of a rule, flips this back to invalid type.
         *
         * This is not perfect logic but works. For example, "grammar T;" means that we start and stop a lexical rule
         * for the "T;". Dangerous but works.
         *
         * The whole point of this state information is to distinguish between [..arg actions..] and [char sets].
         * Char sets can only occur in lexical rules and arg actions cannot occur.
         */
        this.#currentRuleType = Token.INVALID_TYPE;
        this.#insideOptionsBlock = false;
    }

    public override reset(): void {
        this.#currentRuleType = Token.INVALID_TYPE;
        this.#insideOptionsBlock = false;
        super.reset();
    }

    public override emit(): Token {
        if ((this._type === ANTLRv4Lexer.OPTIONS || this._type === ANTLRv4Lexer.TOKENS
            || this._type === ANTLRv4Lexer.CHANNELS)
            && this.#currentRuleType === Token.INVALID_TYPE) {
            // enter prequel construct ending with an RBRACE
            this.#currentRuleType = LexerAdaptor.#PREQUEL_CONSTRUCT;
        } else if (this._type === ANTLRv4Lexer.OPTIONS && this.#currentRuleType === ANTLRv4Lexer.TOKEN_REF) {
            this.#currentRuleType = LexerAdaptor.#OPTIONS_CONSTRUCT;
        } else if (this._type === ANTLRv4Lexer.RBRACE
            && this.#currentRuleType === LexerAdaptor.#PREQUEL_CONSTRUCT) {
            // exit prequel construct
            this.#currentRuleType = Token.INVALID_TYPE;
        } else if (this._type === ANTLRv4Lexer.RBRACE
            && this.#currentRuleType === LexerAdaptor.#OPTIONS_CONSTRUCT) {
            // exit options
            this.#currentRuleType = ANTLRv4Lexer.TOKEN_REF;
        } else if (this._type === ANTLRv4Lexer.AT && this.#currentRuleType === Token.INVALID_TYPE) { // enter action
            this.#currentRuleType = ANTLRv4Lexer.AT;
        } else if (this._type === ANTLRv4Lexer.SEMI
            && this.#currentRuleType === LexerAdaptor.#OPTIONS_CONSTRUCT) {
            // ';' in options { .... }. Don't change anything.
        } else if (this._type === ANTLRv4Lexer.END_ACTION && this.#currentRuleType === ANTLRv4Lexer.AT) { // exit action
            this.#currentRuleType = Token.INVALID_TYPE;
        } else if (this._type === ANTLRv4Lexer.ID) {
            const firstChar = this._input.getText(this._tokenStartCharIndex, this._tokenStartCharIndex);
            const c = firstChar.charAt(0);
            if (c === c.toUpperCase()) {
                this._type = ANTLRv4Lexer.TOKEN_REF;
            } else {
                this._type = ANTLRv4Lexer.RULE_REF;
            }

            if (this.#currentRuleType === Token.INVALID_TYPE) { // if outside of rule def
                this.#currentRuleType = this._type; // set to inside lexer or parser rule
            }
        } else if (this._type === ANTLRv4Lexer.SEMI) { // exit rule def
            this.#currentRuleType = Token.INVALID_TYPE;
        }

        return super.emit();
    }

    protected handleBeginArgument(): void {
        if (this.#currentRuleType === ANTLRv4Lexer.TOKEN_REF) {
            this.pushMode(ANTLRv4Lexer.LexerCharSet);
            this.more();
        } else {
            this.pushMode(ANTLRv4Lexer.Argument);
        }
    }

    protected handleEndArgument(): void {
        this.popMode();
        if (this._modeStack.length > 0) {
            this._type = ANTLRv4Lexer.ARGUMENT_CONTENT;
        }
    }

    protected handleEndAction(): void {
        const oldMode = this._mode;
        const newMode = this.popMode();
        const isActionWithinAction = this._modeStack.length > 0
            && newMode === ANTLRv4Lexer.TargetLanguageAction
            && oldMode === newMode;

        if (isActionWithinAction) {
            this._type = ANTLRv4Lexer.ACTION_CONTENT;
        }
    }
}
