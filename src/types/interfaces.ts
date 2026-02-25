import { Document, Types } from 'mongoose';

export interface IUser extends Document {
	_id: Types.ObjectId;
	name: string;
	email: string;
	password: string;
	document?: string;
	address?: string;
	phone?: string;
	role: Types.ObjectId;
	status: boolean;
	registeredAt: Date;
	favorites: Types.ObjectId[];
}


export interface ProductBase {
	_id: string;
	name: string;
	description?: string;
	category: string; // ObjectId como string
	status?: boolean;
	imageUrl?: string;
}

export type ProductDocument = ProductBase | Types.ObjectId;