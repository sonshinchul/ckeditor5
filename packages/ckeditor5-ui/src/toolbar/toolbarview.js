/**
 * @license Copyright (c) 2003-2019, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module ui/toolbar/toolbarview
 */

/* globals console */

import View from '../view';
import FocusTracker from '@ckeditor/ckeditor5-utils/src/focustracker';
import FocusCycler from '../focuscycler';
import KeystrokeHandler from '@ckeditor/ckeditor5-utils/src/keystrokehandler';
import ToolbarSeparatorView from './toolbarseparatorview';
import getResizeObserver from '@ckeditor/ckeditor5-utils/src/dom/getresizeobserver';
import preventDefault from '../bindings/preventdefault.js';
import Rect from '@ckeditor/ckeditor5-utils/src/dom/rect';
import global from '@ckeditor/ckeditor5-utils/src/dom/global';
import { createDropdown, addToolbarToDropdown } from '../dropdown/utils';
import { attachLinkToDocumentation } from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import verticalDotsIcon from '@ckeditor/ckeditor5-core/theme/icons/three-vertical-dots.svg';

import '../../theme/components/toolbar/toolbar.css';

/**
 * The toolbar view class.
 *
 * @extends module:ui/view~View
 * @implements module:ui/dropdown/dropdownpanelfocusable~DropdownPanelFocusable
 */
export default class ToolbarView extends View {
	/**
	 * Creates an instance of the {@link module:ui/toolbar/toolbarview~ToolbarView} class.
	 *
	 * Also see {@link #render}.
	 *
	 * @param {module:utils/locale~Locale} locale The localization services instance.
	 * @param {module:ui/toolbar/toolbarview~ToolbarOptions} [options] Configuration options of the toolbar.
	 */
	constructor( locale, options ) {
		super( locale );

		const bind = this.bindTemplate;
		const t = this.t;

		/**
		 * A reference to the options object passed to the constructor.
		 *
		 * @readonly
		 * @member {module:ui/toolbar/toolbarview~ToolbarOptions}
		 */
		this.options = options || {};

		/**
		 * Label used by assistive technologies to describe this toolbar element.
		 *
		 * @default 'Editor toolbar'
		 * @member {String} #ariaLabel
		 */
		this.set( 'ariaLabel', t( 'Editor toolbar' ) );

		/**
		 * Collection of the toolbar items (buttons, drop–downs, etc.).
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.items = this.createCollection();

		/**
		 * Tracks information about DOM focus in the toolbar.
		 *
		 * @readonly
		 * @member {module:utils/focustracker~FocusTracker}
		 */
		this.focusTracker = new FocusTracker();

		/**
		 * Instance of the {@link module:utils/keystrokehandler~KeystrokeHandler}
		 * to handle keyboard navigation in the toolbar.
		 *
		 * @readonly
		 * @member {module:utils/keystrokehandler~KeystrokeHandler}
		 */
		this.keystrokes = new KeystrokeHandler();

		/**
		 * An additional CSS class added to the {@link #element}.
		 *
		 * @observable
		 * @member {String} #class
		 */
		this.set( 'class' );

		/**
		 * A (child) view containing {@link #items toolbar items}.
		 *
		 * @readonly
		 * @member {module:ui/toolbar/toolbarview~ItemsView}
		 */
		this.itemsView = new ItemsView( locale );

		/**
		 * A top–level collection aggregating building blocks of the toolbar.
		 *
		 *	┌───────────────── ToolbarView ─────────────────┐
		 *	| ┌──────────────── #children ────────────────┐ |
		 *	| |   ┌──────────── #itemsView ───────────┐   | |
		 *	| |   | [ item1 ] [ item2 ] ... [ itemN ] |   | |
		 *	| |   └──────────────────────────────────-┘   | |
		 *	| └───────────────────────────────────────────┘ |
		 *	└───────────────────────────────────────────────┘
		 *
		 * By default, it contains the {@link #itemsView} but it can be extended with additional
		 * UI elements when necessary.
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.children = this.createCollection();
		this.children.add( this.itemsView );

		/**
		 * A collection of {@link #items} that take part in the focus cycling
		 * (i.e. navigation using the keyboard). Usually, it contains a subset of {@link #items} with
		 * some optional UI elements that also belong to the toolbar and should be focusable
		 * by the user.
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.focusables = this.createCollection();

		/**
		 * Controls the orientation of toolbar items. Only available when
		 * {@link module:ui/toolbar/toolbarview~ToolbarOptions#shouldGroupWhenFull dynamic items grouping}
		 * is **disabled**.
		 *
		 * @observable
		 * @member {Boolean} #isVertical
		 */

		/**
		 * Helps cycling over {@link #focusables focusable items} in the toolbar.
		 *
		 * @readonly
		 * @protected
		 * @member {module:ui/focuscycler~FocusCycler}
		 */
		this._focusCycler = new FocusCycler( {
			focusables: this.focusables,
			focusTracker: this.focusTracker,
			keystrokeHandler: this.keystrokes,
			actions: {
				// Navigate toolbar items backwards using the arrow[left,up] keys.
				focusPrevious: [ 'arrowleft', 'arrowup' ],

				// Navigate toolbar items forwards using the arrow[right,down] keys.
				focusNext: [ 'arrowright', 'arrowdown' ]
			}
		} );

		this.setTemplate( {
			tag: 'div',
			attributes: {
				class: [
					'ck',
					'ck-toolbar',
					bind.to( 'class' )
				],
				role: 'toolbar',
				'aria-label': bind.to( 'ariaLabel' )
			},

			children: this.children,

			on: {
				// https://github.com/ckeditor/ckeditor5-ui/issues/206
				mousedown: preventDefault( this )
			}
		} );

		/**
		 * An instance of the active toolbar behavior that shapes its look and functionality.
		 *
		 * See {@link module:ui/toolbar/toolbarview~ToolbarBehavior} to learn more.
		 *
		 * @protected
		 * @readonly
		 * @member {module:ui/toolbar/toolbarview~ToolbarBehavior}
		 */
		this._behavior = this.options.shouldGroupWhenFull ? new DynamicGrouping( this ) : new StaticLayout( this );
	}

	/**
	 * @inheritDoc
	 */
	render() {
		super.render();

		// Children added before rendering should be known to the #focusTracker.
		for ( const item of this.items ) {
			this.focusTracker.add( item.element );
		}

		this.items.on( 'add', ( evt, item ) => {
			this.focusTracker.add( item.element );
		} );

		this.items.on( 'remove', ( evt, item ) => {
			this.focusTracker.remove( item.element );
		} );

		// Start listening for the keystrokes coming from #element.
		this.keystrokes.listenTo( this.element );

		this._behavior.render( this );
	}

	/**
	 * @inheritDoc
	 */
	destroy() {
		this._behavior.destroy();

		return super.destroy();
	}

	/**
	 * Focuses the first focusable in {@link #focusables}.
	 */
	focus() {
		this._focusCycler.focusFirst();
	}

	/**
	 * Focuses the last focusable in {@link #focusables}.
	 */
	focusLast() {
		this._focusCycler.focusLast();
	}

	/**
	 * A utility which expands a plain toolbar configuration into
	 * {@link module:ui/toolbar/toolbarview~ToolbarView#items} using a given component factory.
	 *
	 * @param {Array.<String>} config The toolbar items config.
	 * @param {module:ui/componentfactory~ComponentFactory} factory A factory producing toolbar items.
	 */
	fillFromConfig( config, factory ) {
		config.map( name => {
			if ( name == '|' ) {
				this.items.add( new ToolbarSeparatorView() );
			} else if ( factory.has( name ) ) {
				this.items.add( factory.create( name ) );
			} else {
				/**
				 * There was a problem processing the configuration of the toolbar. The item with the given
				 * name does not exist so it was omitted when rendering the toolbar.
				 *
				 * This warning usually shows up when the {@link module:core/plugin~Plugin} which is supposed
				 * to provide a toolbar item has not been loaded or there is a typo in the configuration.
				 *
				 * Make sure the plugin responsible for this toolbar item is loaded and the toolbar configuration
				 * is correct, e.g. {@link module:basic-styles/bold~Bold} is loaded for the `'bold'` toolbar item.
				 *
				 * You can use the following snippet to retrieve all available toolbar items:
				 *
				 *		Array.from( editor.ui.componentFactory.names() );
				 *
				 * @error toolbarview-item-unavailable
				 * @param {String} name The name of the component.
				 */
				console.warn( attachLinkToDocumentation(
					'toolbarview-item-unavailable: The requested toolbar item is unavailable.' ), { name } );
			}
		} );
	}
}

/**
 * An inner block of the {@link module:ui/toolbar/toolbarview~ToolbarView} hosting its
 * {@link module:ui/toolbar/toolbarview~ToolbarView#items}.
 *
 * @private
 * @extends module:ui/view~View
 */
class ItemsView extends View {
	/**
	 * @inheritDoc
	 */
	constructor( locale ) {
		super( locale );

		/**
		 * Collection of the items (buttons, drop–downs, etc.).
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.children = this.createCollection();

		this.setTemplate( {
			tag: 'div',
			attributes: {
				class: [
					'ck',
					'ck-toolbar__items'
				],
			},
			children: this.children
		} );
	}
}

/**
 * A toolbar behavior that makes it static and unresponsive to the changes of the environment.
 * It also allows toolbar with the vertical layout.
 *
 * @private
 * @implements module:ui/toolbar/toolbarview~ToolbarBehavior
 */
class StaticLayout {
	/**
	 * Creates an instance of the {@link module:ui/toolbar/toolbarview~StaticLayout} toolbar
	 * behavior.
	 *
	 * @param {module:ui/toolbar/toolbarview~ToolbarView} view An instance of the toolbar this behavior
	 * is added to.
	 */
	constructor( view ) {
		const bind = view.bindTemplate;

		// Static toolbar can be vertical when needed.
		view.set( 'isVertical', false );

		// 1:1 pass–through binding, all ToolbarView#items are visible.
		view.itemsView.children.bindTo( view.items ).using( item => item );

		// 1:1 pass–through binding, all ToolbarView#items are focusable.
		view.focusables.bindTo( view.items ).using( item => item );

		view.extendTemplate( {
			attributes: {
				class: [
					// When vertical, the toolbar has an additional CSS class.
					bind.if( 'isVertical', 'ck-toolbar_vertical' )
				]
			}
		} );
	}

	/**
	 * @inheritDoc
	 */
	render() {}

	/**
	 * @inheritDoc
	 */
	destroy() {}
}

/**
 * A toolbar behavior that makes its items respond to the changes in the geometry.
 *
 * In a nutshell, it groups {@link module:ui/toolbar/toolbarview~ToolbarView#items}
 * that do not fit into visually into a single row of the toolbar (due to limited space).
 * Items that do not fit are aggregated in a dropdown displayed at the end of the toolbar.
 *
 *	┌──────────────────────────────────────── ToolbarView ──────────────────────────────────────────┐
 *	| ┌─────────────────────────────────────── #children ─────────────────────────────────────────┐ |
 *	| |   ┌─────── #itemsView ────────┐ ┌──────────────────────┐ ┌── #groupedItemsDropdown ───┐   | |
 *	| |   |       #ungroupedItems     | | ToolbarSeparatorView | |        #groupedItems       |   | |
 *	| |   └──────────────────────────-┘ └──────────────────────┘ └────────────────────────────┘   | |
 *	| |                                  \---------- only when toolbar items overflow --------/    | |
 *	| └───────────────────────────────────────────────────────────────────────────────────────────┘ |
 *	└───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * @private
 * @implements module:ui/toolbar/toolbarview~ToolbarBehavior
 */
class DynamicGrouping {
	/**
	 * Creates an instance of the {@link module:ui/toolbar/toolbarview~DynamicGrouping} toolbar
	 * behavior.
	 *
	 * @param {module:ui/toolbar/toolbarview~ToolbarView} view An instance of the toolbar this behavior
	 * is added to.
	 */
	constructor( view ) {
		/**
		 * Collection of toolbar children.
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.viewChildren = view.children;

		/**
		 * Collection of toolbar focusable elements.
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.viewFocusables = view.focusables;

		/**
		 * Collection of toolbar focusable elements.
		 *
		 * @readonly
		 * @member {module:ui/toolbar/toolbarview~ItemsView}
		 */
		this.viewItemsView = view.itemsView;

		/**
		 * Focus tracker of the toolbar.
		 *
		 * @readonly
		 * @member {module:utils/focustracker~FocusTracker}
		 */
		this.viewFocusTracker = view.focusTracker;

		/**
		 * Locale of the toolbar.
		 *
		 * @readonly
		 * @member {module:utils/locale~Locale}
		 */
		this.viewLocale = view.locale;

		/**
		 * Element of the toolbar.
		 *
		 * @readonly
		 * @member {HTMLElement} #viewElement
		 */

		/**
		 * A subset of of toolbar {@link module:ui/toolbar/toolbarview~ToolbarView#items}.
		 * Aggregates items that fit into a single row of the toolbar and were not {@link #groupedItems grouped}
		 * into a {@link #groupedItemsDropdown dropdown}. Items of this collection are displayed in the
		 * {@link module:ui/toolbar/toolbarview~ToolbarView#itemsView}.
		 *
		 * When none of the {@link module:ui/toolbar/toolbarview~ToolbarView#items} were grouped, it
		 * matches the {@link module:ui/toolbar/toolbarview~ToolbarView#items} collection in size and order.
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.ungroupedItems = view.createCollection();

		/**
		 * A subset of of toolbar {@link module:ui/toolbar/toolbarview~ToolbarView#items}.
		 * A collection of the toolbar items that do not fit into a single row of the toolbar.
		 * Grouped items are displayed in a dedicated {@link #groupedItemsDropdown dropdown}.
		 *
		 * When none of the {@link module:ui/toolbar/toolbarview~ToolbarView#items} were grouped,
		 * this collection is empty.
		 *
		 * @readonly
		 * @member {module:ui/viewcollection~ViewCollection}
		 */
		this.groupedItems = view.createCollection();

		/**
		 * The dropdown that aggregates {@link #groupedItems grouped items} that do not fit into a single
		 * row of the toolbar. It is displayed on demand as the last of
		 * {@link module:ui/toolbar/toolbarview~ToolbarView#children toolbar children} and offers another
		 * (nested) toolbar which displays items that would normally overflow.
		 *
		 * @readonly
		 * @member {module:ui/dropdown/dropdownview~DropdownView}
		 */
		this.groupedItemsDropdown = this._createGroupedItemsDropdown();

		/**
		 * An instance of the resize observer that helps dynamically determine the geometry of the toolbar
		 * and manage items that do not fit into a single row.
		 *
		 * **Note:** Created in {@link #_enableGroupingOnResize}.
		 *
		 * @readonly
		 * @member {module:utils/dom/getresizeobserver~ResizeObserver}
		 */
		this.resizeObserver = null;

		/**
		 * A cached value of the horizontal padding style used by {@link #_updateGrouping}
		 * to manage the {@link module:ui/toolbar/toolbarview~ToolbarView#items} that do not fit into
		 * a single toolbar line. This value can be reused between updates because it is unlikely that
		 * the padding will change and re–using `Window.getComputedStyle()` is expensive.
		 *
		 * @readonly
		 * @member {Number}
		 */
		this.cachedPadding = null;

		// Only those items that were not grouped are visible to the user.
		view.itemsView.children.bindTo( this.ungroupedItems ).using( item => item );

		// Make sure all #items visible in the main space of the toolbar are "focuscycleable".
		this.ungroupedItems.on( 'add', this._updateFocusCycleableItems.bind( this ) );
		this.ungroupedItems.on( 'remove', this._updateFocusCycleableItems.bind( this ) );

		// Make sure the #groupedItemsDropdown is also included in cycling when it appears.
		view.children.on( 'add', this._updateFocusCycleableItems.bind( this ) );
		view.children.on( 'remove', this._updateFocusCycleableItems.bind( this ) );

		// ToolbarView#items is dynamic. When an item is added, it should be automatically
		// represented in either grouped or ungrouped items at the right index.
		// In other words #items == concat( #ungroupedItems, #groupedItems )
		// (in length and order).
		view.items.on( 'add', ( evt, item, index ) => {
			if ( index > this.ungroupedItems.length ) {
				this.groupedItems.add( item, index - this.ungroupedItems.length );
			} else {
				this.ungroupedItems.add( item, index );
			}

			// When a new ungrouped item joins in and lands in #ungroupedItems, there's a chance it causes
			// the toolbar to overflow.
			this._updateGrouping();
		} );

		// When an item is removed from ToolbarView#items, it should be automatically
		// removed from either grouped or ungrouped items.
		view.items.on( 'remove', ( evt, item, index ) => {
			if ( index > this.ungroupedItems.length ) {
				this.groupedItems.remove( item );
			} else {
				this.ungroupedItems.remove( item );
			}

			// Whether removed from grouped or ungrouped items, there is a chance
			// some new space is available and we could do some ungrouping.
			this._updateGrouping();
		} );

		view.extendTemplate( {
			attributes: {
				class: [
					// To group items dynamically, the toolbar needs a dedicated CSS class.
					'ck-toolbar_grouping'
				]
			}
		} );
	}

	/**
	 * Enables dynamic items grouping based on the dimensions of the toolbar.
	 *
	 * @param {module:ui/toolbar/toolbarview~ToolbarView} view An instance of the toolbar this behavior
	 * is added to.
	 */
	render( view ) {
		this.viewElement = view.element;

		this._enableGroupingOnResize();
	}

	/**
	 * Cleans up the internals used by this behavior.
	 */
	destroy() {
		// The dropdown may not be in ToolbarView#children at the moment of toolbar destruction
		// so let's make sure it's actually destroyed along with the toolbar.
		this.groupedItemsDropdown.destroy();

		this.resizeObserver.disconnect();
	}

	/**
	 * When called, it will check if any of the {@link #ungroupedItems} do not fit into a single row of the toolbar,
	 * and it will move them to the {@link #groupedItems} when it happens.
	 *
	 * At the same time, it will also check if there is enough space in the toolbar for the first of the
	 * {@link #groupedItems} to be returned back to {@link #ungroupedItems} and still fit into a single row
	 * without the toolbar wrapping.
	 *
	 * @protected
	 */
	_updateGrouping() {
		// Do no grouping–related geometry analysis when the toolbar is detached from visible DOM,
		// for instance before #render(), or after render but without a parent or a parent detached
		// from DOM. DOMRects won't work anyway and there will be tons of warning in the console and
		// nothing else.
		if ( !this.viewElement.ownerDocument.body.contains( this.viewElement ) ) {
			return;
		}

		let wereItemsGrouped;

		// Group #items as long as some wrap to the next row. This will happen, for instance,
		// when the toolbar is getting narrow and there is not enough space to display all items in
		// a single row.
		while ( this._areItemsOverflowing ) {
			this._groupLastItem();

			wereItemsGrouped = true;
		}

		// If none were grouped now but there were some items already grouped before,
		// then, what the hell, maybe let's see if some of them can be ungrouped. This happens when,
		// for instance, the toolbar is stretching and there's more space in it than before.
		if ( !wereItemsGrouped && this.groupedItems && this.groupedItems.length ) {
			// Ungroup items as long as none are overflowing or there are none to ungroup left.
			while ( this.groupedItems.length && !this._areItemsOverflowing ) {
				this._ungroupFirstItem();
			}

			// If the ungrouping ended up with some item wrapping to the next row,
			// put it back to the group toolbar ("undo the last ungroup"). We don't know whether
			// an item will wrap or not until we ungroup it (that's a DOM/CSS thing) so this
			// clean–up is vital for the algorithm.
			if ( this._areItemsOverflowing ) {
				this._groupLastItem();
			}
		}
	}

	/**
	 * Enables the functionality that prevents {@link #ungroupedItems} from overflowing
	 * (wrapping to the next row) when there is little space available. Instead, the toolbar items are moved to the
	 * {@link #groupedItems} collection and displayed in a dropdown at the end of the space, which has its own nested toolbar.
	 *
	 * When called, the toolbar will automatically analyze the location of its {@link #ungroupedItems} and "group"
	 * them in the dropdown if necessary. It will also observe the browser window for size changes in
	 * the future and respond to them by grouping more items or reverting already grouped back, depending
	 * on the visual space available.
	 *
	 * @private
	 */
	_enableGroupingOnResize() {
		let previousWidth;

		// TODO: Consider debounce.
		this.resizeObserver = getResizeObserver( ( [ entry ] ) => {
			if ( !previousWidth || previousWidth !== entry.contentRect.width ) {
				this._updateGrouping();

				previousWidth = entry.contentRect.width;
			}
		} );

		this.resizeObserver.observe( this.viewElement );

		this._updateGrouping();
	}

	/**
	 * Returns `true` when {@link module:ui/toolbar/toolbarview~ToolbarView#element} children visually overflow,
	 * for instance if the toolbar is narrower than its members. `false` otherwise.
	 *
	 * @private
	 * @type {Boolean}
	 */
	get _areItemsOverflowing() {
		// An empty toolbar cannot overflow.
		if ( !this.ungroupedItems.length ) {
			return false;
		}

		const element = this.viewElement;
		const uiLanguageDirection = this.viewLocale.uiLanguageDirection;
		const lastChildRect = new Rect( element.lastChild );
		const toolbarRect = new Rect( element );

		if ( !this.cachedPadding ) {
			const computedStyle = global.window.getComputedStyle( element );
			const paddingProperty = uiLanguageDirection === 'ltr' ? 'paddingRight' : 'paddingLeft';

			// parseInt() is essential because of quirky floating point numbers logic and DOM.
			// If the padding turned out too big because of that, the grouped items dropdown would
			// always look (from the Rect perspective) like it overflows (while it's not).
			this.cachedPadding = Number.parseInt( computedStyle[ paddingProperty ] );
		}

		if ( uiLanguageDirection === 'ltr' ) {
			return lastChildRect.right > toolbarRect.right - this.cachedPadding;
		} else {
			return lastChildRect.left < toolbarRect.left + this.cachedPadding;
		}
	}

	/**
	 * The opposite of {@link #_ungroupFirstItem}.
	 *
	 * When called it will remove the last item from {@link #ungroupedItems} and move it to the
	 * {@link #groupedItems} collection.
	 *
	 * @private
	 */
	_groupLastItem() {
		if ( !this.groupedItems.length ) {
			this.viewChildren.add( new ToolbarSeparatorView() );
			this.viewChildren.add( this.groupedItemsDropdown );
			this.viewFocusTracker.add( this.groupedItemsDropdown.element );
		}

		this.groupedItems.add( this.ungroupedItems.remove( this.ungroupedItems.last ), 0 );
	}

	/**
	 * The opposite of {@link #_groupLastItem}.
	 *
	 * Moves the very first item from the toolbar belonging to {@link #groupedItems} back
	 * to the {@link #ungroupedItems} collection.
	 *
	 * @private
	 */
	_ungroupFirstItem() {
		this.ungroupedItems.add( this.groupedItems.remove( this.groupedItems.first ) );

		if ( !this.groupedItems.length ) {
			this.viewChildren.remove( this.groupedItemsDropdown );
			this.viewChildren.remove( this.viewChildren.last );
			this.viewFocusTracker.remove( this.groupedItemsDropdown.element );
		}
	}

	/**
	 * Creates the {@link #groupedItemsDropdown} that hosts the members of the {@link #groupedItems}
	 * collection when there is not enough space in the toolbar to display all items in a single row.
	 *
	 * @private
	 * @returns {module:ui/dropdown/dropdownview~DropdownView}
	 */
	_createGroupedItemsDropdown() {
		const locale = this.viewLocale;
		const t = locale.t;
		const dropdown = createDropdown( locale );

		dropdown.class = 'ck-toolbar__grouped-dropdown';
		addToolbarToDropdown( dropdown, [] );

		dropdown.buttonView.set( {
			label: t( 'Show more items' ),
			tooltip: true,
			icon: verticalDotsIcon
		} );

		// 1:1 pass–through binding.
		dropdown.toolbarView.items.bindTo( this.groupedItems ).using( item => item );

		return dropdown;
	}

	/**
	 * A method that updates the {@link module:ui/toolbar/toolbarview~ToolbarView#focusables focus–cycleable items}
	 * collection so it represents the up–to–date state of the UI from the perspective of the user.
	 *
	 * For instance, the {@link #groupedItemsDropdown} can show up and hide but when it is visible,
	 * it must be subject to focus cycling in the toolbar.
	 *
	 * See the {@link module:ui/toolbar/toolbarview~ToolbarView#focusables collection} documentation
	 * to learn more about the purpose of this method.
	 *
	 * @private
	 */
	_updateFocusCycleableItems() {
		this.viewFocusables.clear();

		this.ungroupedItems.map( item => {
			this.viewFocusables.add( item );
		} );

		if ( this.groupedItems.length ) {
			this.viewFocusables.add( this.groupedItemsDropdown );
		}
	}
}

/**
 * Options passed to the {@link module:ui/toolbar/toolbarview~ToolbarView#constructor} of the toolbar.
 *
 * @interface module:ui/toolbar/toolbarview~ToolbarOptions
 */

/**
 * When set `true`, the toolbar will automatically group {@link module:ui/toolbar/toolbarview~ToolbarView#items} that
 * would normally wrap to the next line when there is not enough space to display them in a single row, for
 * instance, if the parent container of the toolbar is narrow.
 *
 * @member {Boolean} module:ui/toolbar/toolbarview~ToolbarOptions#shouldGroupWhenFull
 */

/**
 * A class interface defining a behavior of the {@link module:ui/toolbar/toolbarview~ToolbarView}.
 *
 * Toolbar behaviors extend its look and functionality and have an impact on the
 * {@link module:ui/toolbar/toolbarview~ToolbarView#element} template or
 * {@link module:ui/toolbar/toolbarview~ToolbarView#render rendering}. They can be enabled
 * conditionally, e.g. depending on the configuration of the toolbar.
 *
 * @private
 * @interface module:ui/toolbar/toolbarview~ToolbarBehavior
 */

/**
 * Creates a new toolbar behavior instance.
 *
 * The instance is created in the {@link module:ui/toolbar/toolbarview~ToolbarView#constructor} of the toolbar.
 * This is the right place to extend the {@link module:ui/toolbar/toolbarview~ToolbarView#template} of
 * the toolbar, define extra toolbar properties, etc..
 *
 * @method #constructor
 * @param {module:ui/toolbar/toolbarview~ToolbarView} view An instance of the toolbar this behavior is added to.
 */

/**
 * A method called after the toolbar has been {@link module:ui/toolbar/toolbarview~ToolbarView#render rendered}.
 * E.g. it can be used to customize the behavior of the toolbar when its {@link module:ui/toolbar/toolbarview~ToolbarView#element}
 * is available.
 *
 * @readonly
 * @member {Function} #render
 * @param {module:ui/toolbar/toolbarview~ToolbarView} view An instance of the toolbar being rendered.
 */

/**
 * A method called after the toolbar has been {@link module:ui/toolbar/toolbarview~ToolbarView#destroy destroyed}.
 * It allows cleaning up after the toolbar behavior, for instance, this is the right place to detach
 * event listeners, free up references, etc..
 *
 * @readonly
 * @member {Function} #destroy
 */
