import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CartItem } from './model';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private cartSubject = new BehaviorSubject<{ [shopId: number]: CartItem[] }>({});
  cart$ = this.cartSubject.asObservable();

  constructor() { }

  get cart() {
    return this.cartSubject.value;
  }

  addToCart(item: CartItem, shopId: number) {
    const currentCart = { ...this.cart };
    if (!currentCart[shopId]) {
      currentCart[shopId] = [];
    } else {
      currentCart[shopId] = [...currentCart[shopId]];
    }

    const shopCart = currentCart[shopId];
    const existingItem = shopCart.find(i => i.id === item.id && i.type === item.type);

    if (existingItem) {
      // Create new item object for immutability
      const index = shopCart.indexOf(existingItem);
      shopCart[index] = { ...existingItem, quantity: existingItem.quantity + 1 };
    } else {
      shopCart.push({ ...item }); // Ensure we store a copy
    }

    this.cartSubject.next(currentCart);
  }

  removeFromCart(item: CartItem, shopId: number) {
    const currentCart = { ...this.cart };
    if (!currentCart[shopId]) return;
    
    currentCart[shopId] = [...currentCart[shopId]];
    const shopCart = currentCart[shopId];

    const index = shopCart.findIndex(i => i.id === item.id && i.type === item.type);
    if (index === -1) return;

    if (shopCart[index].quantity > 1) {
       shopCart[index] = { ...shopCart[index], quantity: shopCart[index].quantity - 1 };
    } else {
      shopCart.splice(index, 1);
      if (shopCart.length === 0) {
        delete currentCart[shopId];
      }
    }

    this.cartSubject.next(currentCart);
  }

  clearCart(shopId: number) {
    const currentCart = { ...this.cart };
    if (currentCart[shopId]) {
        delete currentCart[shopId];
        this.cartSubject.next(currentCart);
    }
  }
  
  getCartItemsCount(): number {
    let count = 0;
    Object.values(this.cart).forEach(items => {
      items.forEach(item => count += item.quantity);
    });
    return count;
  }

  getCartShopIds(): number[] {
    return Object.keys(this.cart).map(Number);
  }

  getShopTotal(shopId: number): number {
    return this.cart[shopId]?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
  }
}
